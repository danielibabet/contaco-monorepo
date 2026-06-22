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

export default function ImpuestosPage() {
    const { tenantId, ejercicio } = useTenant();
    const [trimestre, setTrimestre] = useState<number>(1);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{
        IvaDevengado: number;
        IvaDeducible: number;
        Resultado: number;
    } | null>(null);

    const calcular = useCallback(async () => {
        if (!tenantId || !ejercicio) return;

        setLoading(true);
        setData(null);

        try {
            const session: any = await getSession();
            const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': session?.accessToken || ''
                },
                body: JSON.stringify({
                    query: CALCULAR_MODELO_303,
                    variables: { TenantId: tenantId, Ejercicio: ejercicio, Trimestre: trimestre }
                })
            });

            const json = await res.json();
            if (json.errors) throw new Error(json.errors[0].message);

            setData(json.data.calcularModelo303);
        } catch (error: any) {
            toast.error(error.message || "Error al calcular el Modelo 303");
        } finally {
            setLoading(false);
        }
    }, [tenantId, ejercicio, trimestre]);

    useEffect(() => {
        calcular();
    }, [calcular]);

    const formatCurr = (val: number) => val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

    return (
        <div className="h-full flex flex-col max-w-6xl mx-auto w-full">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Modelos Fiscales</h1>
                <p className="text-gray-500 mt-2">
                    Liquidación Trimestral de IVA (Modelo 303) del Ejercicio {ejercicio}
                </p>
            </header>

            {/* Tabs de Trimestre */}
            <div className="flex bg-white rounded-lg p-1 shadow-sm border mb-8 max-w-md">
                {[1, 2, 3, 4].map(t => (
                    <button
                        key={t}
                        onClick={() => setTrimestre(t)}
                        className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${
                            trimestre === t 
                                ? 'bg-blue-600 text-white shadow' 
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                        Trimestre {t}
                    </button>
                ))}
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* IVA Repercutido */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border flex flex-col justify-between">
                    <h3 className="text-gray-500 font-medium text-sm">IVA Devengado (Repercutido/Ventas)</h3>
                    <div className="mt-4">
                        {loading ? (
                            <div className="h-10 w-32 bg-gray-200 animate-pulse rounded"></div>
                        ) : (
                            <span className="text-4xl font-bold text-gray-800">
                                {data ? formatCurr(data.IvaDevengado) : '--'}
                            </span>
                        )}
                    </div>
                </div>

                {/* IVA Soportado */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border flex flex-col justify-between">
                    <h3 className="text-gray-500 font-medium text-sm">IVA Deducible (Soportado/Compras)</h3>
                    <div className="mt-4">
                        {loading ? (
                            <div className="h-10 w-32 bg-gray-200 animate-pulse rounded"></div>
                        ) : (
                            <span className="text-4xl font-bold text-gray-800">
                                {data ? formatCurr(data.IvaDeducible) : '--'}
                            </span>
                        )}
                    </div>
                </div>

                {/* RESULTADO FINAL */}
                <div className={`rounded-2xl p-6 shadow-sm border flex flex-col justify-between transition-colors ${
                    !data || loading ? 'bg-white' : 
                    data.Resultado > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                }`}>
                    <h3 className={`font-medium text-sm ${
                        !data || loading ? 'text-gray-500' :
                        data.Resultado > 0 ? 'text-red-700' : 'text-green-700'
                    }`}>
                        Resultado Liquidación (Modelo 303)
                    </h3>
                    <div className="mt-4 flex items-end justify-between">
                        {loading ? (
                            <div className="h-12 w-40 bg-gray-200 animate-pulse rounded"></div>
                        ) : (
                            <span className={`text-5xl font-black tracking-tight ${
                                !data ? 'text-gray-800' :
                                data.Resultado > 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                                {data ? formatCurr(Math.abs(data.Resultado)) : '--'}
                            </span>
                        )}
                    </div>
                    {data && !loading && (
                        <div className={`mt-3 text-sm font-bold ${data.Resultado > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {data.Resultado > 0 ? '⚠️ A INGRESAR (PAGAR)' : '✅ A COMPENSAR / DEVOLVER'}
                        </div>
                    )}
                </div>

            </div>
            
            <div className="mt-8 bg-blue-50 text-blue-800 p-4 rounded-lg border border-blue-100 text-sm">
                ℹ️ <strong>Nota:</strong> Esta liquidación calcula el saldo de las cuentas 477 (Devengado) y 472 (Deducible) dentro de los límites del trimestre seleccionado ({ejercicio}).
            </div>
        </div>
    );
}
