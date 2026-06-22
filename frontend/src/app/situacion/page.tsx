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

export default function SituacionPage() {
  const { tenantId, ejercicio } = useTenant();
  const [activo, setActivo] = useState<CuentaBalance[]>([]);
  const [pasivo, setPasivo] = useState<CuentaBalance[]>([]);
  const [totalActivo, setTotalActivo] = useState(0);
  const [totalPasivo, setTotalPasivo] = useState(0);
  const [loading, setLoading] = useState(false);

  const cargarSituacion = useCallback(async () => {
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
        body: JSON.stringify({
          query: OBTENER_BALANCE_QUERY,
          variables: { TenantId: tenantId, Ejercicio: ejercicio }
        })
      });

      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);

      const balances: CuentaBalance[] = json.data.obtenerBalanceSumasSaldos;
      
      const directivo = balances.filter(b => b.Nivel === '3');

      // Activo (Grupos 1-5 con saldo deudor predominante)
      // Tradicionalmente, Activo son los bienes y derechos (Saldo Deudor)
      // Pasivo y Patrimonio Neto son obligaciones y fondos propios (Saldo Acreedor)
      // Para un informe real, se agrupan específicamente, pero como MVP haremos:
      // Activo: saldo deudor neto de grupos 1-5
      // Pasivo/Patrimonio: saldo acreedor neto de grupos 1-5 + Resultado Ejercicio (129)
      
      const cuentas1_5 = directivo.filter(b => /^[1-5]/.test(b.SubcuentaId));
      
      const act: CuentaBalance[] = [];
      const pas: CuentaBalance[] = [];
      let tActivo = 0;
      let tPasivo = 0;

      cuentas1_5.forEach(cta => {
          const saldo = cta.SaldoDeudor - cta.SaldoAcreedor;
          if (saldo > 0) {
              act.push(cta);
              tActivo += saldo;
          } else if (saldo < 0) {
              pas.push(cta);
              tPasivo += Math.abs(saldo);
          }
      });

      // Incluir también el Resultado del Ejercicio de la 6 y 7
      const ing_gas = directivo.filter(b => /^[6-7]/.test(b.SubcuentaId));
      const rtdoDeudor = ing_gas.reduce((acc, c) => acc + c.SaldoDeudor, 0);
      const rtdoAcreedor = ing_gas.reduce((acc, c) => acc + c.SaldoAcreedor, 0);
      const rtdoFinal = rtdoAcreedor - rtdoDeudor;

      if (rtdoFinal > 0) {
          pas.push({ SubcuentaId: 'RTDO', Descripcion: 'Resultado del Ejercicio (Beneficio)', SaldoAcreedor: rtdoFinal, SaldoDeudor: 0, Nivel: '3' });
          tPasivo += rtdoFinal;
      } else if (rtdoFinal < 0) {
          act.push({ SubcuentaId: 'RTDO', Descripcion: 'Resultado del Ejercicio (Pérdida)', SaldoDeudor: Math.abs(rtdoFinal), SaldoAcreedor: 0, Nivel: '3' });
          tActivo += Math.abs(rtdoFinal);
      }

      setActivo(act);
      setPasivo(pas);
      
      // Redondeos para evitar JS floats
      setTotalActivo(Math.round(tActivo * 100) / 100);
      setTotalPasivo(Math.round(tPasivo * 100) / 100);
      
    } catch (error: any) {
      toast.error(error.message || "Error al cargar Balance");
    } finally {
      setLoading(false);
    }
  }, [tenantId, ejercicio]);

  useEffect(() => {
    cargarSituacion();
  }, [cargarSituacion]);

  const descuadre = totalActivo !== totalPasivo;

  return (
    <div className="max-w-5xl mx-auto py-8">
      <header className="mb-8 flex justify-between items-end border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Balance de Situación</h1>
          <p className="text-gray-500 mt-2">Visión patrimonial de la empresa (Activo y Pasivo).</p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Columna Activo */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-2 mb-4 flex justify-between">
                    <span>Activo</span>
                    <span className="text-blue-600">{totalActivo.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </h2>
                <div className="space-y-3">
                    {activo.map(cta => (
                        <div key={cta.SubcuentaId} className="flex justify-between items-center text-sm">
                            <div className="flex gap-3">
                                <span className="font-mono text-gray-500">{cta.SubcuentaId}</span>
                                <span className="text-gray-700 truncate max-w-[200px]">{cta.Descripcion}</span>
                            </div>
                            <span className="font-medium text-gray-900">
                                {cta.SaldoDeudor ? cta.SaldoDeudor.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : Math.abs(cta.SaldoAcreedor).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Columna Pasivo */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-2 mb-4 flex justify-between">
                    <span>Pasivo y Pat. Neto</span>
                    <span className="text-blue-600">{totalPasivo.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </h2>
                <div className="space-y-3">
                    {pasivo.map(cta => (
                        <div key={cta.SubcuentaId} className="flex justify-between items-center text-sm">
                            <div className="flex gap-3">
                                <span className="font-mono text-gray-500">{cta.SubcuentaId}</span>
                                <span className="text-gray-700 truncate max-w-[200px]">{cta.Descripcion}</span>
                            </div>
                            <span className="font-medium text-gray-900">
                                {cta.SaldoAcreedor ? cta.SaldoAcreedor.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : Math.abs(cta.SaldoDeudor).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {descuadre && (
               <div className="col-span-1 md:col-span-2 bg-red-100 text-red-700 p-4 rounded mt-4 border border-red-200">
                  ⚠️ <strong>Descuadre Patrimonial:</strong> El total del Activo no coincide con el total del Pasivo y Patrimonio Neto.
               </div>
            )}
        </div>
      )}
    </div>
  );
}
