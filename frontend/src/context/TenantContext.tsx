'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getSession, useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';

interface TenantContextProps {
  tenantId: string;
  setTenantId: (id: string) => void;
  ejercicio: string;
  setEjercicio: (ejercicio: string) => void;
  userRole: string;
  setUserRole: (role: string) => void;
  isLoadingTenant: boolean;
}

const TenantContext = createContext<TenantContextProps | undefined>(undefined);

const LISTAR_EMPRESAS_QUERY = `
  query ListarEmpresas {
    listarEmpresas {
      TenantId
      Rol
    }
  }
`;

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [tenantId, setTenantIdState] = useState<string>('');
  const [ejercicio, setEjercicioState] = useState<string>('2026');
  const [userRole, setUserRole] = useState<string>('EMPLEADO');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);
  const [hasLoadedTenant, setHasLoadedTenant] = useState(false);
  
  const router = useRouter();
  const pathname = usePathname();

  const isAuthRoute = ['/login', '/register', '/verify', '/forgot-password', '/reset-password'].includes(pathname);
  const effectiveIsLoadingTenant = !isAuthRoute && !hasLoadedTenant;

  useEffect(() => {
    if (isAuthRoute) {
      setIsLoaded(true);
      setIsLoadingTenant(false);
      return;
    }

    if (hasLoadedTenant) return;
    if (status !== 'authenticated') return; 

    const init = async () => {
      setIsLoadingTenant(true);
      const savedTenant = localStorage.getItem('contaco_tenantId');
      const savedEjercicio = localStorage.getItem('contaco_ejercicio');

      if (savedEjercicio) setEjercicioState(savedEjercicio);

      // We are authenticated, we should have a session
      if (!session || !(session as any).accessToken) {
        setIsLoaded(true);
        setIsLoadingTenant(false);
        return;
      }

      try {
        const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: (session as any).accessToken },
          body: JSON.stringify({ query: LISTAR_EMPRESAS_QUERY })
        });
        const json = await res.json();
        const empresas = json.data?.listarEmpresas || [];

        if (empresas.length === 0) {
          setTenantIdState('');
          setUserRole('EMPLEADO');
          if (pathname !== '/empresas') {
            router.push('/empresas?welcome=true');
          }
        } else {
          const validTenant = empresas.find((e: any) => e.TenantId === savedTenant);
          if (validTenant) {
            setTenantIdState(savedTenant!);
            setUserRole(validTenant.Rol);
          } else {
            const first = empresas[0].TenantId;
            setTenantIdState(first);
            setUserRole(empresas[0].Rol);
            localStorage.setItem('contaco_tenantId', first);
          }
        }
      } catch (err) {
        console.error("Error fetching tenants:", err);
      } finally {
        setHasLoadedTenant(true);
        setIsLoaded(true);
        setIsLoadingTenant(false);
      }
    };

    init();
  }, [pathname, hasLoadedTenant, router, status, session, isAuthRoute]);

  const setTenantId = (id: string) => {
    setTenantIdState(id);
    localStorage.setItem('contaco_tenantId', id);
  };

  const setEjercicio = (ej: string) => {
    setEjercicioState(ej);
    localStorage.setItem('contaco_ejercicio', ej);
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <TenantContext.Provider value={{ tenantId, setTenantId, ejercicio, setEjercicio, userRole, setUserRole, isLoadingTenant: effectiveIsLoadingTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant debe utilizarse dentro de un TenantProvider');
  }
  return context;
}
