'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { useTenant } from '@/context/TenantContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import ProtectedRoute from '@/components/ProtectedRoute';

const DASHBOARD_QUERY = `
  query GetDashboardData($TenantId: String!, $Ejercicio: String!) {
    obtenerDashboardStats(TenantId: $TenantId, Ejercicio: $Ejercicio) {
      TotalIngresos
      TotalGastos
      PendienteCobro
      PendientePago
    }
    obtenerIngresosMensuales(TenantId: $TenantId, Ejercicio: $Ejercicio) {
      mes
      valor
    }
  }
`;

export default function DashboardPage() {
  const { tenantId, ejercicio } = useTenant();
  const [stats, setStats] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  const loadData = useCallback(async () => {
    if (!tenantId || !ejercicio) return;
    try {
      setLoading(true);
      const data = await fetchGraphQL(DASHBOARD_QUERY, { TenantId: tenantId, Ejercicio: ejercicio });
      if (data) {
        setStats(data.obtenerDashboardStats);
        setChartData(data.obtenerIngresosMensuales);
      }
    } catch (err) {
      console.error("Error al cargar dashboard:", err);
      toast.error("Error cargando el Dashboard de BI");
    } finally {
      setLoading(false);
    }
  }, [tenantId, ejercicio]);

  useEffect(() => { loadData(); }, [loadData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
  };

  if (loading || !stats) {
    return (
      <div className="flex flex-col gap-6 h-screen w-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="text-slate-500 font-medium animate-pulse">Cargando inteligencia de negocio...</p>
      </div>
    );
  }

  // Calculate some derived metrics
  const beneficio = stats.TotalIngresos - stats.TotalGastos;
  const margen = stats.TotalIngresos > 0 ? (beneficio / stats.TotalIngresos) * 100 : 0;

  return (
    <ProtectedRoute requiredRole="ADMIN">
      <div className="flex flex-col gap-6 h-screen w-full relative">
      <header className="flex justify-between items-end border-b border-slate-200 dark:border-slate-700 pb-5 mb-2">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Business Intelligence</h1>
          <p className="text-slate-500 mt-2 font-medium">Visión global del rendimiento financiero para el ejercicio {ejercicio}.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Tarjeta Ingresos */}
        <div className="tour-step-ingresos bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center">
             <svg className="w-8 h-8 text-emerald-500 absolute bottom-6 left-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Total Ingresos</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(stats.TotalIngresos)}</h2>
        </div>

        {/* Tarjeta Gastos */}
        <div className="tour-step-gastos bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center">
             <svg className="w-8 h-8 text-rose-500 absolute bottom-6 left-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
          </div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Total Gastos</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(stats.TotalGastos)}</h2>
        </div>

        {/* Tarjeta Pendiente Cobro */}
        <div className="tour-step-pendiente-cobro bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow relative overflow-hidden border-l-4 border-l-emerald-500">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Pendiente de Cobro</p>
          <h2 className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(stats.PendienteCobro)}</h2>
          <p className="text-xs font-medium text-slate-400 mt-2">Facturas emitidas no cobradas</p>
        </div>

        {/* Tarjeta Pendiente Pago */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow relative overflow-hidden border-l-4 border-l-rose-500">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Pendiente de Pago</p>
          <h2 className="text-3xl font-black text-rose-600 dark:text-rose-400 tabular-nums">{formatCurrency(stats.PendientePago)}</h2>
          <p className="text-xs font-medium text-slate-400 mt-2">Facturas recibidas no pagadas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
        {/* Gráfico Principal */}
        <div className="tour-step-grafico lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Evolución de Ingresos</h3>
            <p className="text-sm text-slate-500">Facturación mensual emitida durante el ejercicio</p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(value) => `${value}€`} dx={-10} />
                <RechartsTooltip 
                  formatter={(value: any) => [`${value} €`, 'Ingresos']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="valor" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorValor)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Resumen y Margen */}
        <div className="flex flex-col gap-6">
          <div className="bg-indigo-600 rounded-2xl p-6 shadow-md text-white flex flex-col justify-center items-center text-center relative overflow-hidden flex-1">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-500/50 rounded-full blur-2xl"></div>
            <div className="absolute -left-10 -top-10 w-40 h-40 bg-indigo-400/50 rounded-full blur-2xl"></div>
            
            <h3 className="text-indigo-100 font-bold uppercase tracking-wider text-sm mb-2 z-10">Beneficio Neto (EBITDA aprox)</h3>
            <div className="text-5xl font-black mb-4 z-10">{formatCurrency(beneficio)}</div>
            
            <div className="bg-white/20 px-4 py-2 rounded-full backdrop-blur-md z-10 flex items-center gap-2">
              <span className="font-bold text-xl">{margen.toFixed(1)}%</span>
              <span className="text-indigo-100 text-sm">Margen Bruto</span>
            </div>
          </div>
          
          <div className="tour-step-salud bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex-1">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Salud Financiera</h3>
             
             <div className="space-y-5">
               <div>
                 <div className="flex justify-between text-sm mb-1">
                   <span className="font-semibold text-slate-700 dark:text-slate-300">Ratio de Cobro</span>
                   <span className="font-bold text-emerald-600">{stats.TotalIngresos > 0 ? ((stats.TotalIngresos - stats.PendienteCobro) / stats.TotalIngresos * 100).toFixed(0) : 0}%</span>
                 </div>
                 <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                   <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${stats.TotalIngresos > 0 ? ((stats.TotalIngresos - stats.PendienteCobro) / stats.TotalIngresos * 100) : 0}%` }}></div>
                 </div>
               </div>

               <div>
                 <div className="flex justify-between text-sm mb-1">
                   <span className="font-semibold text-slate-700 dark:text-slate-300">Ratio de Pago</span>
                   <span className="font-bold text-rose-600">{stats.TotalGastos > 0 ? ((stats.TotalGastos - stats.PendientePago) / stats.TotalGastos * 100).toFixed(0) : 0}%</span>
                 </div>
                 <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                   <div className="bg-rose-500 h-2 rounded-full" style={{ width: `${stats.TotalGastos > 0 ? ((stats.TotalGastos - stats.PendientePago) / stats.TotalGastos * 100) : 0}%` }}></div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
    </ProtectedRoute>
  );
}
