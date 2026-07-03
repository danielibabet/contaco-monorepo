'use client';

import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import TenantSelector from './TenantSelector';
import ThemeToggle from './ThemeToggle';
import { useTenant } from '@/context/TenantContext';
import { useTour } from '@/context/TourContext';

export default function Sidebar() {
  const { userRole } = useTenant();
  const { startTour } = useTour();

  const links = [
    { name: 'Dashboard BI', href: '/', adminOnly: true },
    { name: 'Asiento Diario', href: '/asientos', adminOnly: true },
    { name: 'Diario Histórico', href: '/diario', adminOnly: true },
    { name: 'Subcuentas', href: '/subcuentas', adminOnly: true },
    { name: 'Libro Mayor', href: '/mayor', adminOnly: true },
    { name: 'Conciliación Bancaria', href: '/conciliacion', adminOnly: true },
    { name: 'Balance Sumas y Saldos', href: '/balances', adminOnly: true },
    { name: 'Balance de Situación', href: '/situacion', adminOnly: true },
    { name: 'Pérdidas y Ganancias', href: '/pyg', adminOnly: true },
    { name: 'Modelos Fiscales (303, 390, 347)', href: '/modelos', adminOnly: true },
    { name: 'Facturación', href: '/facturas', adminOnly: false },
    { name: 'Inmovilizado', href: '/activos', adminOnly: true },
    { name: 'Cierre Anual', href: '/cierre', adminOnly: true },
    { name: 'Migración DBF', href: '/migracion', adminOnly: true },
    { name: 'Configuración de Empresas', href: '/empresas', adminOnly: true },
  ];

  const visibleLinks = links.filter(link => !link.adminOnly || userRole === 'ADMIN');

  return (
    <div className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 min-h-screen flex flex-col fixed shadow-sm z-50 transition-colors">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 dark:bg-slate-900/50 flex flex-col items-center">
        <Image src="/logo-contaco.png" alt="ContaCo Logo" width={200} height={66} className="mb-1 object-contain" priority />
      </div>
      
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <TenantSelector />
      </div>

      <nav className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">
        {visibleLinks.map((link) => (
          <Link 
            key={link.name} 
            href={link.href}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-indigo-400 transition-all flex items-center gap-3"
          >
            {link.name}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 dark:bg-slate-900/50 flex flex-col gap-3">
        <button
          onClick={startTour}
          className="w-full px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition-colors font-bold text-sm shadow-sm flex justify-center items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Ayuda / Tutorial
        </button>
        <ThemeToggle />
        <button 
          onClick={() => signOut()}
          className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-700 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800 text-slate-700 dark:text-slate-200 rounded-lg transition-colors font-bold text-sm shadow-sm"
        >
          Cerrar Sesión
        </button>
        <div className="text-xs font-medium text-slate-400 text-center uppercase tracking-wider">
          v0.78 Daniel Ibáñez Betés
        </div>
      </div>
    </div>
  );
}
