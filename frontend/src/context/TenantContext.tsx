'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';

interface TenantContextProps {
  tenantId: string;
  setTenantId: (id: string) => void;
  ejercicio: string;
  setEjercicio: (ejercicio: string) => void;
  isLoadingTenant: boolean;
}

const TenantContext = createContext<TenantContextProps | undefined>(undefined);

const LISTAR_EMPRESAS_QUERY = `
  query ListarEmpresas {
    listarEmpresas {
      TenantId
    }
  }
`;

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenantIdState] = useState<string>('');
  const [ejercicio, setEjercicioState] = useState<string>('2026');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);
  
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const init = async () => {
      const savedTenant = localStorage.getItem('contaco_tenantId');
      const savedEjercicio = localStorage.getItem('contaco_ejercicio');

      if (savedEjercicio) setEjercicioState(savedEjercicio);

      const session: any = await getSession();
      if (!session) {
        setIsLoaded(true);
        setIsLoadingTenant(false);
        return;
      }

      try {
        const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: session.accessToken },
          body: JSON.stringify({ query: LISTAR_EMPRESAS_QUERY })
        });
        const json = await res.json();
        const empresas = json.data?.listarEmpresas || [];

        if (empresas.length === 0) {
          setTenantIdState('');
          if (pathname !== '/empresas') {
            router.push('/empresas?welcome=true');
          }
        } else {
          const validTenant = empresas.find((e: any) => e.TenantId === savedTenant);
          if (validTenant) {
            setTenantIdState(savedTenant!);
          } else {
            const first = empresas[0].TenantId;
            setTenantIdState(first);
            localStorage.setItem('contaco_tenantId', first);
          }
        }
      } catch (err) {
        console.error("Error fetching tenants:", err);
      } finally {
        setIsLoaded(true);
        setIsLoadingTenant(false);
      }
    };
    
    if (pathname === '/login' || pathname === '/register') {
      setIsLoaded(true);
      setIsLoadingTenant(false);
    } else {
      init();
    }
  }, [pathname, router]);

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
    <TenantContext.Provider value={{ tenantId, setTenantId, ejercicio, setEjercicio, isLoadingTenant }}>
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
