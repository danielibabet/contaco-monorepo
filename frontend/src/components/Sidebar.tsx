'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import TenantSelector from './TenantSelector';

export default function Sidebar() {
  const links = [
    { name: 'Panel de Control', href: '/' },
    { name: 'Asiento Diario', href: '/' },
    { name: 'Diario Histórico', href: '/diario' },
    { name: 'Subcuentas', href: '/subcuentas' },
    { name: 'Libro Mayor', href: '/mayor' },
    { name: 'Conciliación Bancaria', href: '/conciliacion', icon: '🏦' },
    { name: 'Balance Sumas y Saldos', href: '/balances', icon: '⚖️' },
    { name: 'Balance de Situación', href: '/situacion', icon: '🏛️' },
    { name: 'Pérdidas y Ganancias', href: '/pyg', icon: '📈' },
    { name: 'Impuestos (Modelo 303)', href: '/impuestos', icon: '🏛️' },
    { name: 'Cierre Anual', href: '/cierre', icon: '🔒' },
    { name: 'Migración DBF', href: '/migracion' },
  ];

  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen flex flex-col fixed shadow-lg">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-2xl font-bold tracking-wider text-blue-400">ContaCo</h1>
        <p className="text-xs text-gray-400 mt-1">Cloud Edition</p>
      </div>
      
      <TenantSelector />

      <nav className="flex-1 p-4 flex flex-col gap-2">
        {links.map((link) => (
          <Link 
            key={link.name} 
            href={link.href}
            className="px-4 py-3 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            {link.name}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-800 flex flex-col gap-3">
        <button 
          onClick={() => signOut()}
          className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold text-sm"
        >
          Cerrar Sesión
        </button>
        <div className="text-xs text-gray-500 text-center">
          Demo Mode - v1.0
        </div>
      </div>
    </div>
  );
}
