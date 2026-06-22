'use client';

import React, { useEffect, useState } from 'react';
import { useTenant } from '@/context/TenantContext';
import { getSession } from 'next-auth/react';

const LISTAR_EMPRESAS_QUERY = `
  query ListarEmpresas {
    listarEmpresas {
      TenantId
      Nombre
    }
  }
`;

export default function TenantSelector() {
  const { tenantId, setTenantId, ejercicio, setEjercicio } = useTenant();
  const [empresas, setEmpresas] = useState<{ TenantId: string; Nombre: string }[]>([]);
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
          setEmpresas(json.data.listarEmpresas);
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
    <div className="flex flex-col gap-3 p-4 bg-gray-50 border-t border-b border-gray-200">
      <div className="flex flex-col">
        <label className="text-xs font-semibold text-gray-500 uppercase mb-1">Empresa Activa</label>
        <select 
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          disabled={loading}
          className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
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
        <label className="text-xs font-semibold text-gray-500 uppercase mb-1">Ejercicio</label>
        <select 
          value={ejercicio}
          onChange={(e) => setEjercicio(e.target.value)}
          className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
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
