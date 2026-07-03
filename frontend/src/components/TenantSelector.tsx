'use client';

import React, { useEffect, useState } from 'react';
import { useTenant } from '@/context/TenantContext';
import { getSession } from 'next-auth/react';

const LISTAR_EMPRESAS_QUERY = `
  query ListarEmpresas {
    listarEmpresas {
      TenantId
      Nombre
      Rol
    }
  }
`;

export default function TenantSelector() {
  const { tenantId, setTenantId, ejercicio, setEjercicio, setUserRole } = useTenant();
  const [empresas, setEmpresas] = useState<{ TenantId: string; Nombre: string; Rol: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEmpresas() {
      try {
        const session: any = await getSession();
        if (!session?.accessToken) return;

        const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': session.accessToken,
          },
          body: JSON.stringify({
            query: LISTAR_EMPRESAS_QUERY,
          })
        });

        const json = await res.json();
        if (json.data && json.data.listarEmpresas) {
          const loadedEmpresas = json.data.listarEmpresas;
          setEmpresas(loadedEmpresas);
          
          if (loadedEmpresas.length > 0) {
            const currentTenant = localStorage.getItem('contaco_tenantId') || tenantId;
            const exists = loadedEmpresas.find((e: any) => e.TenantId === currentTenant);
            if (exists) {
              setTenantId(exists.TenantId);
              setUserRole(exists.Rol);
            } else {
              setTenantId(loadedEmpresas[0].TenantId);
              setUserRole(loadedEmpresas[0].Rol);
            }
          } else {
            setTenantId('');
            setUserRole('EMPLEADO');
          }
        }
      } catch (err) {
        console.error("Error al cargar empresas:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchEmpresas();
  }, []);

  return (
    <div className="flex flex-col gap-3 p-1 bg-transparent">
      <div className="flex flex-col">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 px-1">Empresa Activa</label>
        <select 
          value={tenantId}
          onChange={(e) => {
            const newTenantId = e.target.value;
            setTenantId(newTenantId);
            const emp = empresas.find(emp => emp.TenantId === newTenantId);
            if (emp) setUserRole(emp.Rol);
          }}
          disabled={loading}
          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 font-semibold text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 block p-2.5 shadow-sm transition-all"
        >
          {loading ? (
            <option>Cargando empresas...</option>
          ) : (
            empresas.map((emp) => (
              <option key={emp.TenantId} value={emp.TenantId}>
                {emp.Nombre}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 px-1">Ejercicio</label>
        <select 
          value={ejercicio}
          onChange={(e) => setEjercicio(e.target.value)}
          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 font-semibold text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 block p-2.5 shadow-sm transition-all"
        >
          <option value="2024">2024</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
          <option value="2027">2027</option>
        </select>
      </div>
    </div>
  );
}
