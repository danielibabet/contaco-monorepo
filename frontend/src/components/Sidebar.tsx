'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import TenantSelector from './TenantSelector';
import ThemeToggle from './ThemeToggle';

export default function Sidebar() {
  const links = [
    { name: 'Asiento Diario', href: '/' },
    { name: 'Diario Histórico', href: '/diario' },
    { name: 'Subcuentas', href: '/subcuentas' },
    { name: 'Libro Mayor', href: '/mayor' },
    { name: 'Conciliación Bancaria', href: '/conciliacion' },
    { name: 'Balance Sumas y Saldos', href: '/balances' },
    { name: 'Balance de Situación', href: '/situacion' },
    { name: 'Pérdidas y Ganancias', href: '/pyg' },
    { name: 'Modelos Fiscales (303, 390, 347)', href: '/modelos' },
    { name: 'Cierre Anual', href: '/cierre' },
    { name: 'Migración DBF', href: '/migracion' },
    { name: 'Configuración de Empresas', href: '/empresas' },
  ];

  return (
    <div className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 min-h-screen flex flex-col fixed shadow-sm z-50 transition-colors">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 dark:bg-slate-900/50 flex flex-col items-center">
        <img src="/logo.png" alt="ContaCo Logo" width={180} height={60} className="mb-1" />
        <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-widest text-center">Cloud Edition</p>
      </div>
      
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <TenantSelector />
      </div>

      <nav className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">
        {links.map((link) => (
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
        <ThemeToggle />
        <button 
          onClick={() => signOut()}
          className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-700 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800 text-slate-700 dark:text-slate-200 rounded-lg transition-colors font-bold text-sm shadow-sm"
        >
          Cerrar Sesión
        </button>
        <div className="text-xs font-medium text-slate-400 text-center uppercase tracking-wider">
          Demo Mode - v0.78
        </div>
      </div>
    </div>
  );
}
