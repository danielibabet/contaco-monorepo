'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface TenantContextProps {
  tenantId: string;
  setTenantId: (id: string) => void;
  ejercicio: string;
  setEjercicio: (ejercicio: string) => void;
}

const TenantContext = createContext<TenantContextProps | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenantIdState] = useState<string>('empresa-demo-01');
  const [ejercicio, setEjercicioState] = useState<string>('2026');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Leer valores guardados en localStorage al inicializar
    const savedTenant = localStorage.getItem('contaco_tenantId');
    const savedEjercicio = localStorage.getItem('contaco_ejercicio');

    if (savedTenant) setTenantIdState(savedTenant);
    if (savedEjercicio) setEjercicioState(savedEjercicio);
    
    setIsLoaded(true);
  }, []);

  const setTenantId = (id: string) => {
    setTenantIdState(id);
    localStorage.setItem('contaco_tenantId', id);
  };

  const setEjercicio = (ej: string) => {
    setEjercicioState(ej);
    localStorage.setItem('contaco_ejercicio', ej);
  };

  if (!isLoaded) {
    return null; // O un spinner sutil, para evitar desajustes de hidratación
  }

  return (
    <TenantContext.Provider value={{ tenantId, setTenantId, ejercicio, setEjercicio }}>
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
