'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { getSession } from 'next-auth/react';
import { useTenant } from '@/context/TenantContext';
import toast from 'react-hot-toast';
import SubcuentaSelector from '@/components/SubcuentaSelector';

const PROCESAR_FICHERO_BANCO_MUTATION = `
  mutation ProcesarFicheroBanco($contenidoBase64: String!) {
    procesarFicheroBanco(contenidoBase64: $contenidoBase64) {
      Fecha
      Importe
      Concepto
      Referencia
    }
  }
`;

const OBTENER_MAYOR_QUERY = `
  query ObtenerMayor($TenantId: String!, $Ejercicio: String!, $SubcuentaId: String!) {
    obtenerMayor(TenantId: $TenantId, Ejercicio: $Ejercicio, SubcuentaId: $SubcuentaId) {
      SubcuentaId
      Apuntes {
        IdAsiento
        Linea
        Fecha
        Concepto
        Debe
        Haber
        Punteado
      }
    }
  }
`;

const ALTERNAR_PUNTEO_MUTATION = `
  mutation AlternarPunteo($TenantId: String!, $Ejercicio: String!, $IdAsiento: String!, $Linea: String!, $Estado: Boolean!) {
    alternarPunteo(TenantId: $TenantId, Ejercicio: $Ejercicio, IdAsiento: $IdAsiento, Linea: $Linea, Estado: $Estado)
  }
`;

interface MovimientoBancario {
    id: string; // Generado localmente para tracking
    Fecha: string;
    Importe: number;
    Concepto: string;
    Referencia: string;
    matchedWith?: string; // IdAsiento_Linea
}

interface MayorLinea {
    IdAsiento: string;
    Linea: string;
    Fecha: string;
    Concepto: string;
    Debe: number;
    Haber: number;
    Punteado: boolean;
    matchedWith?: string; // id del MovimientoBancario
}

export default function ConciliacionPage() {
    const { tenantId, ejercicio } = useTenant();
    const [subcuentaId, setSubcuentaId] = useState<string>('');
    const [movimientosBanco, setMovimientosBanco] = useState<MovimientoBancario[]>([]);
    const [movimientosMayor, setMovimientosMayor] = useState<MayorLinea[]>([]);
    const [loadingBanco, setLoadingBanco] = useState(false);
    const [loadingMayor, setLoadingMayor] = useState(false);
    const [procesandoMatches, setProcesandoMatches] = useState(false);

    // 1. Cargar Mayor
    const cargarMayor = async (cuentaId: string) => {
        setSubcuentaId(cuentaId);
        if (!cuentaId) {
            setMovimientosMayor([]);
            return;
        }

        setLoadingMayor(true);
        try {
            const session: any = await getSession();
            const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
                body: JSON.stringify({
                    query: OBTENER_MAYOR_QUERY,
                    variables: { TenantId: tenantId, Ejercicio: ejercicio, SubcuentaId: cuentaId }
                })
            });

            const json = await res.json();
            if (json.errors) throw new Error(json.errors[0].message);

            // Filtramos solo los NO punteados
            const apuntes = json.data.obtenerMayor.Apuntes.filter((a: any) => !a.Punteado);
            setMovimientosMayor(apuntes);
            
            // Si ya hay banco cargado, lanzamos Auto-Match
            if (movimientosBanco.length > 0) {
                ejecutarAutoMatch(movimientosBanco, apuntes);
            }
        } catch (err: any) {
            toast.error(err.message || "Error al cargar el Libro Mayor");
        } finally {
            setLoadingMayor(false);
        }
    };

    // 2. Cargar Norma 43
    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setLoadingBanco(true);
        try {
            // Leer archivo como Base64
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Data = (e.target?.result as string).split(',')[1];

                const session: any = await getSession();
                const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
                    body: JSON.stringify({
                        query: PROCESAR_FICHERO_BANCO_MUTATION,
                        variables: { contenidoBase64: base64Data }
                    })
                });

                const json = await res.json();
                if (json.errors) throw new Error(json.errors[0].message);

                const movs: MovimientoBancario[] = json.data.procesarFicheroBanco.map((m: any, i: number) => ({
                    ...m,
                    id: `banco_${i}`
                }));

                setMovimientosBanco(movs);
                toast.success(`Fichero procesado: ${movs.length} movimientos detectados.`);
                
                // Lanzar Auto-Match
                if (movimientosMayor.length > 0) {
                    ejecutarAutoMatch(movs, movimientosMayor);
                }
            };
            reader.readAsDataURL(file);
        } catch (error: any) {
            toast.error(error.message || "Error al procesar N43");
            setLoadingBanco(false);
        }
    }, [movimientosMayor]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'text/plain': ['.txt', '.n43', '.c43'] } });

    // 3. Motor de Auto-Match
    const ejecutarAutoMatch = (banco: MovimientoBancario[], mayor: MayorLinea[]) => {
        let newBanco: MovimientoBancario[] = [...banco.map(b => ({ ...b, matchedWith: undefined }))];
        let newMayor: MayorLinea[] = [...mayor.map(m => ({ ...m, matchedWith: undefined }))];

        const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;

        newBanco.forEach(bMov => {
            if (bMov.matchedWith) return;

            // Buscar en mayor un apunte no matcheado que cumpla criterios
            const matchIndex = newMayor.findIndex(mMov => {
                if (mMov.matchedWith) return false;

                // Criterio 1: Importe exacto y Signo
                const importeMayor = (mMov.Debe || 0) - (mMov.Haber || 0); // Si Debe > 0 (Cobro, +). Si Haber > 0 (Pago, -)
                // Ojo: En N43, Importe > 0 es Cobro (nuestro Debe). Importe < 0 es Pago (nuestro Haber).
                if (Math.abs(importeMayor - bMov.Importe) > 0.001) return false;

                // Criterio 2: Fecha +/- 3 días
                const bDate = new Date(bMov.Fecha).getTime();
                const mDate = new Date(mMov.Fecha).getTime();
                if (Math.abs(bDate - mDate) > TRES_DIAS_MS) return false;

                return true;
            });

            if (matchIndex > -1) {
                const mMov = newMayor[matchIndex];
                bMov.matchedWith = `${mMov.IdAsiento}_${mMov.Linea}`;
                mMov.matchedWith = bMov.id;
            }
        });

        setMovimientosBanco(newBanco);
        setMovimientosMayor(newMayor);
        
        const matchesCount = newBanco.filter(b => b.matchedWith).length;
        if (matchesCount > 0) {
            toast.success(`¡Auto-Match completado! Se han encontrado ${matchesCount} coincidencias exactas.`, { icon: '✨' });
        } else {
            toast('No se han encontrado coincidencias automáticas.', { icon: 'ℹ️' });
        }
        setLoadingBanco(false);
    };

    // 4. Confirmar Matches
    const confirmarMatches = async () => {
        const matches = movimientosMayor.filter(m => m.matchedWith);
        if (matches.length === 0) return toast.error("No hay coincidencias para confirmar.");

        setProcesandoMatches(true);
        try {
            const session: any = await getSession();
            
            // Ejecutamos las mutaciones en paralelo
            await Promise.all(matches.map(m => 
                fetch(process.env.NEXT_PUBLIC_API_URL || '', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
                    body: JSON.stringify({
                        query: ALTERNAR_PUNTEO_MUTATION,
                        variables: {
                            TenantId: tenantId,
                            Ejercicio: ejercicio,
                            IdAsiento: m.IdAsiento,
                            Linea: m.Linea,
                            Estado: true
                        }
                    })
                })
            ));

            toast.success(`¡${matches.length} movimientos conciliados y punteados!`);
            
            // Recargar Mayor para hacer desaparecer los punteados
            cargarMayor(subcuentaId);
            
            // Limpiar banco de los ya matcheados
            setMovimientosBanco(prev => prev.filter(b => !b.matchedWith));

        } catch (error: any) {
            toast.error("Hubo un error al confirmar algunos punteos.");
        } finally {
            setProcesandoMatches(false);
        }
    };

    const matchesCount = movimientosBanco.filter(b => b.matchedWith).length;

    return (
        <div className="flex flex-col h-full gap-4 overflow-hidden">
            <header className="flex justify-between items-end border-b pb-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        Conciliación Bancaria Automática
                    </h1>
                    <p className="text-gray-500 mt-1">Sube tu extracto Norma 43 y deja que el motor encaje los descuadres mágicamente.</p>
                </div>
                {matchesCount > 0 && (
                    <button 
                        onClick={confirmarMatches}
                        disabled={procesandoMatches}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transition-all animate-in fade-in zoom-in"
                    >
                        {procesandoMatches ? 'Procesando...' : `Confirmar ${matchesCount} Matches ✓`}
                    </button>
                )}
            </header>

            <div className="flex gap-4 shrink-0">
                <div className="flex-1 bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-center">
                    <label className="text-sm font-semibold text-gray-700 mb-2">Selecciona la Cuenta Bancaria a Conciliar (ej. 5720000):</label>
                    <SubcuentaSelector 
                        onSelect={(s) => cargarMayor(s?.CodSubcuenta || '')} 
                        className="w-full"
                    />
                </div>

                <div 
                    {...getRootProps()} 
                    className={`flex-1 p-4 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors ${
                        isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 bg-white dark:bg-slate-900'
                    }`}
                >
                    <input {...getInputProps()} />
                    <div className="text-center">
                        <svg className="mx-auto h-8 w-8 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Arrastra tu fichero Norma 43 (.txt)</p>
                    </div>
                </div>
            </div>

            <div className="flex gap-4 flex-1 overflow-hidden">
                {/* Columna Izquierda: Banco */}
                <div className="flex-1 flex flex-col bg-gray-50 dark:bg-slate-800 border rounded-xl overflow-hidden shadow-inner">
                    <div className="bg-gray-200 p-3 font-bold text-gray-700 text-center border-b shadow-sm z-10 flex justify-between items-center">
                        <span>Fichero Bancario (N43)</span>
                        <span className="bg-gray-300 text-xs px-2 py-1 rounded-full">{movimientosBanco.length} movs</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loadingBanco && <p className="text-center text-gray-500">Procesando fichero...</p>}
                        {movimientosBanco.length === 0 && !loadingBanco && <p className="text-center text-gray-400 italic mt-10">Sube un fichero Norma 43 para ver los movimientos.</p>}
                        
                        {movimientosBanco.map((b, idx) => (
                            <div key={idx} className={`p-4 rounded-lg border shadow-sm flex flex-col gap-1 transition-colors ${b.matchedWith ? 'bg-green-50 border-green-400' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-gray-700'}`}>
                                <div className="flex justify-between items-start">
                                    <span className="font-bold text-gray-800 dark:text-gray-200">{b.Fecha}</span>
                                    <span className={`font-bold text-lg ${b.Importe > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(b.Importe)}
                                    </span>
                                </div>
                                <span className="text-sm text-gray-600 dark:text-gray-400 truncate" title={b.Concepto}>{b.Concepto}</span>
                                {b.matchedWith && <span className="text-xs text-green-600 font-bold mt-1">✓ Emparejado</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Columna Derecha: Libro Mayor */}
                <div className="flex-1 flex flex-col bg-gray-50 dark:bg-slate-800 border rounded-xl overflow-hidden shadow-inner">
                    <div className="bg-gray-200 p-3 font-bold text-gray-700 text-center border-b shadow-sm z-10 flex justify-between items-center">
                        <span>Libro Mayor (No Punteados)</span>
                        <span className="bg-gray-300 text-xs px-2 py-1 rounded-full">{movimientosMayor.length} apuntes</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loadingMayor && <p className="text-center text-gray-500">Cargando libro mayor...</p>}
                        {movimientosMayor.length === 0 && !loadingMayor && <p className="text-center text-gray-400 italic mt-10">Selecciona una cuenta contable para ver sus apuntes pendientes de conciliación.</p>}

                        {movimientosMayor.map((m, idx) => {
                            const importeMayor = (m.Debe || 0) - (m.Haber || 0);
                            return (
                                <div key={idx} className={`p-4 rounded-lg border shadow-sm flex flex-col gap-1 transition-colors ${m.matchedWith ? 'bg-green-50 border-green-400' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-gray-700'}`}>
                                    <div className="flex justify-between items-start">
                                        <span className="font-bold text-gray-800 dark:text-gray-200">{m.Fecha} <span className="text-xs text-gray-400 ml-1">Asiento {m.IdAsiento}</span></span>
                                        <span className={`font-bold text-lg ${importeMayor > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                            {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(importeMayor)}
                                        </span>
                                    </div>
                                    <span className="text-sm text-gray-600 dark:text-gray-400 truncate" title={m.Concepto}>{m.Concepto}</span>
                                    {m.matchedWith && <span className="text-xs text-green-600 font-bold mt-1">✓ Auto-Match detectado</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
