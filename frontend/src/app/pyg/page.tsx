'use client';

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getSession } from 'next-auth/react';
import { useTenant } from '@/context/TenantContext';

const OBTENER_BALANCE_QUERY = `
  query ObtenerBalanceSumasSaldos($TenantId: String!, $Ejercicio: String!) {
    obtenerBalanceSumasSaldos(TenantId: $TenantId, Ejercicio: $Ejercicio) {
      SubcuentaId
      Descripcion
      SaldoDeudor
      SaldoAcreedor
      Nivel
    }
  }
`;

interface CuentaBalance {
  SubcuentaId: string;
  Descripcion: string;
  SaldoDeudor: number;
  SaldoAcreedor: number;
  Nivel: string;
}

export default function PyGPage() {
  const { tenantId, ejercicio } = useTenant();
  const [ingresos, setIngresos] = useState<CuentaBalance[]>([]);
  const [gastos, setGastos] = useState<CuentaBalance[]>([]);
  const [totalIngresos, setTotalIngresos] = useState(0);
  const [totalGastos, setTotalGastos] = useState(0);
  const [loading, setLoading] = useState(false);

  const cargarPyG = useCallback(async () => {
    setLoading(true);
    try {
      const session: any = await getSession();
      if (!session?.accessToken) throw new Error("No autenticado");

      const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session.accessToken,
        },
        cache: 'no-store',
        body: JSON.stringify({
          query: OBTENER_BALANCE_QUERY,
          variables: { TenantId: tenantId, Ejercicio: ejercicio }
        })
      });

      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);

      const balances: CuentaBalance[] = json.data.obtenerBalanceSumasSaldos;
      
      // Filtramos solo el Nivel 'MAX' para calcular (las subcuentas reales)
      // O bien podemos mostrar el Nivel '3' para un resumen directivo. Vamos a mostrar Nivel 3.
      const directivo = balances.filter(b => b.Nivel === '3');

      const ing = directivo.filter(b => b.SubcuentaId.startsWith('7'));
      const gas = directivo.filter(b => b.SubcuentaId.startsWith('6'));

      const tIng = ing.reduce((acc, curr) => acc + (curr.SaldoAcreedor - curr.SaldoDeudor), 0);
      const tGas = gas.reduce((acc, curr) => acc + (curr.SaldoDeudor - curr.SaldoAcreedor), 0);

      setIngresos(ing);
      setGastos(gas);
      setTotalIngresos(tIng);
      setTotalGastos(tGas);
      
    } catch (error: any) {
      toast.error(error.message || "Error al cargar PyG");
    } finally {
      setLoading(false);
    }
  }, [tenantId, ejercicio]);

  useEffect(() => {
    cargarPyG();
  }, [cargarPyG]);

  const resultado = totalIngresos - totalGastos;
  const esBeneficio = resultado >= 0;

  return (
    <div className="tour-step-1 max-w-5xl mx-auto py-8">
      <header className="mb-8 flex justify-between items-end border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Cuenta de Pérdidas y Ganancias</h1>
          <p className="text-gray-500 mt-2">Visión directiva de la rentabilidad (Grupos 6 y 7).</p>
        </div>
        <div className="text-right">
            <p className="text-sm text-gray-500 uppercase tracking-widest font-semibold">Resultado del Ejercicio</p>
            <p className={`text-4xl font-bold ${esBeneficio ? 'text-green-600' : 'text-red-600'}`}>
                {resultado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Columna Ingresos */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 border-b pb-2 mb-4 flex justify-between">
                    <span>Ingresos de Explotación</span>
                    <span className="text-green-600">{totalIngresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </h2>
                <div className="space-y-3">
                    {ingresos.length === 0 ? (
                        <p className="text-gray-400 text-sm italic">Sin movimientos en el Grupo 7</p>
                    ) : ingresos.map(cta => (
                        <div key={cta.SubcuentaId} className="flex justify-between items-center text-sm">
                            <div className="flex gap-3">
                                <span className="font-mono text-gray-500">{cta.SubcuentaId}</span>
                                <span className="text-gray-700 truncate max-w-[200px]">{cta.Descripcion}</span>
                            </div>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                {(cta.SaldoAcreedor - cta.SaldoDeudor).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Columna Gastos */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 border-b pb-2 mb-4 flex justify-between">
                    <span>Gastos de Explotación</span>
                    <span className="text-red-600">{totalGastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </h2>
                <div className="space-y-3">
                    {gastos.length === 0 ? (
                        <p className="text-gray-400 text-sm italic">Sin movimientos en el Grupo 6</p>
                    ) : gastos.map(cta => (
                        <div key={cta.SubcuentaId} className="flex justify-between items-center text-sm">
                            <div className="flex gap-3">
                                <span className="font-mono text-gray-500">{cta.SubcuentaId}</span>
                                <span className="text-gray-700 truncate max-w-[200px]">{cta.Descripcion}</span>
                            </div>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                {(cta.SaldoDeudor - cta.SaldoAcreedor).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
