'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { useTenant } from '@/context/TenantContext';
import ProtectedRoute from '@/components/ProtectedRoute';

const LISTAR_ACTIVOS_QUERY = `
  query ListarActivos($TenantId: String!, $Ejercicio: String!) {
    listarActivos(TenantId: $TenantId, Ejercicio: $Ejercicio) {
      Id
      Nombre
      CuentaContable
      ValorAdquisicion
      MesesAmortizacion
      CuotaMensual
      FechaAlta
      Estado
      MesesAmortizados
    }
  }
`;

const CREAR_ACTIVO_MUTATION = `
  mutation CrearActivo($input: CrearActivoInput!) {
    crearActivo(input: $input) {
      Id
    }
  }
`;

export default function ActivosPage() {
  const { tenantId, ejercicio } = useTenant();
  const [activos, setActivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchGraphQL = async (query: string, variables: any) => {
    const session: any = await getSession();
    const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
      cache: 'no-store',
      body: JSON.stringify({ query, variables })
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
  };

  const cargarActivos = useCallback(async () => {
    if (!tenantId || !ejercicio) return;
    try {
      setLoading(true);
      const data = await fetchGraphQL(LISTAR_ACTIVOS_QUERY, { TenantId: tenantId, Ejercicio: ejercicio });
      if (data?.listarActivos) setActivos(data.listarActivos);
    } catch (err) {
      console.error("Error al cargar activos:", err);
      toast.error("Error cargando inmovilizado");
    } finally {
      setLoading(false);
    }
  }, [tenantId, ejercicio]);

  useEffect(() => { cargarActivos(); }, [cargarActivos]);

  return (
    <ProtectedRoute requiredRole="ADMIN">
      <div className="flex flex-col gap-6 h-screen w-full relative">
        <header className="flex justify-between items-end border-b border-slate-200 dark:border-slate-700 pb-5 mb-2">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Inmovilizado</h1>
          <p className="text-slate-500 mt-2 font-medium">Gestión de activos y amortizaciones automáticas.</p>
        </div>
        <button 
          onClick={() => setModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-md transition-all hover:-translate-y-0.5"
        >
          + Registrar Activo
        </button>
      </header>

      <main className="flex-1 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex justify-center items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-4 px-6 font-semibold">Nombre del Activo</th>
                  <th className="py-4 px-6 font-semibold">Fecha Alta</th>
                  <th className="py-4 px-6 font-semibold text-right">Valor Adq.</th>
                  <th className="py-4 px-6 font-semibold text-right">Cuota Mensual</th>
                  <th className="py-4 px-6 font-semibold text-center">Progreso de Amortización</th>
                  <th className="py-4 px-6 font-semibold text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                {activos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">No hay activos registrados.</td>
                  </tr>
                ) : activos.map((a, i) => {
                  const percent = Math.min(100, Math.round((a.MesesAmortizados / a.MesesAmortizacion) * 100));
                  return (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-semibold text-slate-900 dark:text-white">{a.Nombre}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">Cta: {a.CuentaContable}</div>
                      </td>
                      <td className="py-4 px-6 tabular-nums">{a.FechaAlta}</td>
                      <td className="py-4 px-6 text-right tabular-nums font-bold">{a.ValorAdquisicion.toFixed(2)}€</td>
                      <td className="py-4 px-6 text-right tabular-nums text-slate-500">{a.CuotaMensual.toFixed(2)}€/mes</td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1.5 w-48 mx-auto">
                          <div className="flex justify-between text-xs">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">{percent}%</span>
                            <span className="text-slate-500">{a.MesesAmortizados} / {a.MesesAmortizacion} meses</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                            <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${percent}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${a.Estado === 'AMORTIZADO' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                          {a.Estado}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {modalOpen && (
        <CrearActivoModal 
          onClose={() => setModalOpen(false)} 
          tenantId={tenantId} 
          ejercicio={ejercicio} 
          onSaved={() => {
            setModalOpen(false);
            cargarActivos();
          }} 
          fetchGraphQL={fetchGraphQL}
        />
      )}
      </div>
    </ProtectedRoute>
  );
}

function CrearActivoModal({ onClose, tenantId, ejercicio, onSaved, fetchGraphQL }: any) {
  const [nombre, setNombre] = useState('');
  const [fechaAlta, setFechaAlta] = useState(new Date().toISOString().split('T')[0]);
  const [cuentaContable, setCuentaContable] = useState('2120000');
  const [valorAdquisicion, setValorAdquisicion] = useState('');
  const [mesesAmortizacion, setMesesAmortizacion] = useState('48');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const input = {
        TenantId: tenantId,
        Ejercicio: ejercicio,
        Nombre: nombre,
        CuentaContable: cuentaContable,
        FechaAlta: fechaAlta,
        ValorAdquisicion: parseFloat(valorAdquisicion),
        MesesAmortizacion: parseInt(mesesAmortizacion, 10)
      };

      await fetchGraphQL(CREAR_ACTIVO_MUTATION, { input });
      toast.success(`Activo registrado correctamente`);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar el activo');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tour-step-1 fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Registrar Nuevo Activo</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nombre del Activo</label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Ej: Portátil Dell XPS 15" className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Cuenta Contable</label>
              <input type="text" value={cuentaContable} onChange={(e) => setCuentaContable(e.target.value)} required placeholder="2120000" className="w-full font-mono border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Fecha de Alta</label>
              <input type="date" value={fechaAlta} onChange={(e) => setFechaAlta(e.target.value)} required className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
            <div>
              <label className="block text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wide mb-1">Valor Adquisición</label>
              <div className="relative">
                <input type="number" step="0.01" value={valorAdquisicion} onChange={(e) => setValorAdquisicion(e.target.value)} required placeholder="1500.00" className="w-full border border-indigo-200 dark:border-indigo-800/50 rounded-lg p-2.5 pr-8 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-right tabular-nums" />
                <span className="absolute right-3 top-2.5 text-slate-400 font-bold">€</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wide mb-1">Vida Útil (Meses)</label>
              <input type="number" value={mesesAmortizacion} onChange={(e) => setMesesAmortizacion(e.target.value)} required placeholder="48" className="w-full border border-indigo-200 dark:border-indigo-800/50 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-right tabular-nums" />
            </div>
          </div>

          {valorAdquisicion && mesesAmortizacion && (
            <div className="text-center text-sm text-slate-500 mt-2">
              Cuota de amortización estimada: <strong className="text-slate-900 dark:text-white font-bold text-lg tabular-nums">{(parseFloat(valorAdquisicion) / parseInt(mesesAmortizacion, 10)).toFixed(2)} €/mes</strong>
            </div>
          )}

          <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-5 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all disabled:opacity-50 flex items-center gap-2">
              {submitting ? 'Guardando...' : 'Registrar Activo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
