'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getSession } from 'next-auth/react';
import { useTenant } from '@/context/TenantContext';
import toast from 'react-hot-toast';

const CALCULAR_MODELO_303 = `
  query CalcularModelo303($TenantId: String!, $Ejercicio: String!, $Trimestre: Int!) {
    calcularModelo303(TenantId: $TenantId, Ejercicio: $Ejercicio, Trimestre: $Trimestre) {
      Trimestre
      IvaDevengado
      IvaDeducible
      Resultado
    }
  }
`;

const CALCULAR_MODELO_390 = `
  query CalcularModelo390($TenantId: String!, $Ejercicio: String!) {
    calcularModelo390(TenantId: $TenantId, Ejercicio: $Ejercicio) {
      Ejercicio
      IvaDevengado
      IvaDeducible
      Resultado
    }
  }
`;

const CALCULAR_MODELO_347 = `
  query CalcularModelo347($TenantId: String!, $Ejercicio: String!) {
    calcularModelo347(TenantId: $TenantId, Ejercicio: $Ejercicio) {
      SubcuentaId
      Nombre
      Nif
      TotalOperaciones
    }
  }
`;

type ModeloActivo = '303' | '390' | '347';

export default function ModelosPage() {
    const { tenantId, ejercicio } = useTenant();
    const [modeloActivo, setModeloActivo] = useState<ModeloActivo>('303');
    
    // Estado 303
    const [trimestre, setTrimestre] = useState<number>(1);
    const [data303, setData303] = useState<{IvaDevengado: number; IvaDeducible: number; Resultado: number;} | null>(null);
    
    // Estado 390
    const [data390, setData390] = useState<{IvaDevengado: number; IvaDeducible: number; Resultado: number;} | null>(null);
    
    // Estado 347
    const [data347, setData347] = useState<Array<{SubcuentaId: string; Nombre: string; Nif: string; TotalOperaciones: number;}>>([]);

    const [loading, setLoading] = useState(false);

    const calcular = useCallback(async () => {
        if (!tenantId || !ejercicio) return;

        setLoading(true);
        setData303(null);
        setData390(null);
        setData347([]);

        try {
            const session: any = await getSession();
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': session?.accessToken || ''
            };

            let body;
            if (modeloActivo === '303') {
                body = JSON.stringify({
                    query: CALCULAR_MODELO_303,
                    variables: { TenantId: tenantId, Ejercicio: ejercicio, Trimestre: trimestre }
                });
            } else if (modeloActivo === '390') {
                body = JSON.stringify({
                    query: CALCULAR_MODELO_390,
                    variables: { TenantId: tenantId, Ejercicio: ejercicio }
                });
            } else {
                body = JSON.stringify({
                    query: CALCULAR_MODELO_347,
                    variables: { TenantId: tenantId, Ejercicio: ejercicio }
                });
            }

            const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', { method: 'POST', headers, cache: 'no-store', body });
            const json = await res.json();
            
            if (json.errors) throw new Error(json.errors[0].message);

            if (modeloActivo === '303') setData303(json.data.calcularModelo303);
            else if (modeloActivo === '390') setData390(json.data.calcularModelo390);
            else setData347(json.data.calcularModelo347 || []);

        } catch (error: any) {
            toast.error(error.message || `Error al calcular el Modelo ${modeloActivo}`);
        } finally {
            setLoading(false);
        }
    }, [tenantId, ejercicio, modeloActivo, trimestre]);

    useEffect(() => {
        calcular();
    }, [calcular]);

    const formatCurr = (val: number) => val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

    return (
        <div className="h-full flex flex-col max-w-6xl mx-auto w-full">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Modelos Fiscales</h1>
                <p className="text-gray-500 mt-2">
                    Cálculo y revisión de impuestos del Ejercicio {ejercicio}
                </p>
            </header>

            {/* Selector de Modelos */}
            <div className="flex bg-white dark:bg-slate-900 rounded-lg p-1 shadow-sm border mb-8 max-w-2xl">
                {(['303', '390', '347'] as ModeloActivo[]).map(m => (
                    <button
                        key={m}
                        onClick={() => setModeloActivo(m)}
                        className={`flex-1 py-3 px-4 text-sm font-semibold rounded-md transition-all ${
                            modeloActivo === m 
                                ? 'bg-indigo-600 text-white shadow' 
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-slate-800 hover:text-gray-900 dark:text-gray-100'
                        }`}
                    >
                        {m === '303' && 'Modelo 303 (IVA Trimestral)'}
                        {m === '390' && 'Modelo 390 (IVA Anual)'}
                        {m === '347' && 'Modelo 347 (Op. Terceros)'}
                    </button>
                ))}
            </div>

            {/* CONTENIDO 303 */}
            {modeloActivo === '303' && (
                <div className="animate-fade-in">
                    <div className="flex bg-white dark:bg-slate-900 rounded-lg p-1 shadow-sm border mb-8 max-w-md">
                        {[1, 2, 3, 4].map(t => (
                            <button key={t} onClick={() => setTrimestre(t)} className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${trimestre === t ? 'bg-blue-600 text-white shadow' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-slate-800'}`}>Trimestre {t}</button>
                        ))}
                    </div>
                    <ResumenIvaCards data={data303} loading={loading} formatCurr={formatCurr} />
                </div>
            )}

            {/* CONTENIDO 390 */}
            {modeloActivo === '390' && (
                <div className="animate-fade-in">
                    <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-800 text-sm">
                        Resumen Anual del Impuesto sobre el Valor Añadido (Total Ejercicio {ejercicio})
                    </div>
                    <ResumenIvaCards data={data390} loading={loading} formatCurr={formatCurr} />
                </div>
            )}

            {/* CONTENIDO 347 */}
            {modeloActivo === '347' && (
                <div className="animate-fade-in flex flex-col h-full">
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-sm">
                        Declaración Anual de Operaciones con Terceras Personas. Se muestran clientes y proveedores con un volumen de operaciones superior a <strong>3.005,06 €</strong>.
                    </div>
                    
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 dark:bg-slate-800">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subcuenta</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NIF</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre / Razón Social</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Volumen Op.</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200">
                                {loading && (
                                    <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Calculando operaciones...</td></tr>
                                )}
                                {!loading && data347.length === 0 && (
                                    <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No hay terceros que superen los 3.005,06 € este ejercicio.</td></tr>
                                )}
                                {!loading && data347.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 dark:bg-slate-800">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{row.SubcuentaId}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.Nif}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-semibold">{row.Nombre}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-gray-100 text-right">{formatCurr(row.TotalOperaciones)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
        </div>
    );
}

function ResumenIvaCards({ data, loading, formatCurr }: { data: any, loading: boolean, formatCurr: (v: number)=>string }) {
    return (
        <div className="tour-step-1 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border flex flex-col justify-between">
                <h3 className="text-gray-500 font-medium text-sm">IVA Devengado (Repercutido/Ventas)</h3>
                <div className="mt-4">
                    {loading ? <div className="h-10 w-32 bg-gray-200 animate-pulse rounded"></div> : <span className="text-4xl font-bold text-gray-800 dark:text-gray-200">{data ? formatCurr(data.IvaDevengado) : '--'}</span>}
                </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border flex flex-col justify-between">
                <h3 className="text-gray-500 font-medium text-sm">IVA Deducible (Soportado/Compras)</h3>
                <div className="mt-4">
                    {loading ? <div className="h-10 w-32 bg-gray-200 animate-pulse rounded"></div> : <span className="text-4xl font-bold text-gray-800 dark:text-gray-200">{data ? formatCurr(data.IvaDeducible) : '--'}</span>}
                </div>
            </div>
            <div className={`rounded-2xl p-6 shadow-sm border flex flex-col justify-between transition-colors ${!data || loading ? 'bg-white dark:bg-slate-900' : data.Resultado > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <h3 className={`font-medium text-sm ${!data || loading ? 'text-gray-500' : data.Resultado > 0 ? 'text-red-700' : 'text-green-700'}`}>Resultado Liquidación</h3>
                <div className="mt-4 flex items-end justify-between">
                    {loading ? <div className="h-12 w-40 bg-gray-200 animate-pulse rounded"></div> : <span className={`text-5xl font-black tracking-tight ${!data ? 'text-gray-800 dark:text-gray-200' : data.Resultado > 0 ? 'text-red-600' : 'text-green-600'}`}>{data ? formatCurr(Math.abs(data.Resultado)) : '--'}</span>}
                </div>
                {data && !loading && (
                    <div className={`mt-3 text-sm font-bold ${data.Resultado > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {data.Resultado > 0 ? '⚠️ A INGRESAR (PAGAR)' : '✅ A COMPENSAR / DEVOLVER'}
                    </div>
                )}
            </div>
        </div>
    );
}
