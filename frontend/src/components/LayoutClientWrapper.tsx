"use client";
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { useTenant } from '@/context/TenantContext';
import { useEffect } from 'react';

export function LayoutClientWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { tenantId, isLoadingTenant } = useTenant();
  
  const isAuthRoute = pathname === '/login' || pathname === '/register' || pathname === '/verify';
  const isEmpresasRoute = pathname === '/empresas';

  useEffect(() => {
    if (!isAuthRoute && !isEmpresasRoute && !isLoadingTenant && !tenantId) {
       router.push('/empresas?welcome=true');
    }
  }, [isAuthRoute, isEmpresasRoute, isLoadingTenant, tenantId, router]);

  if (!isAuthRoute && !isEmpresasRoute && !isLoadingTenant && !tenantId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <p className="text-slate-500 animate-pulse">Redirigiendo a empresas...</p>
      </div>
    );
  }

  return (
    <>
      {!isAuthRoute && <Sidebar />}
      <main className={`flex-1 ${isAuthRoute ? '' : 'ml-64 p-6 md:p-10'} h-screen overflow-y-auto`}>
        {children}
      </main>
    </>
  );
}
