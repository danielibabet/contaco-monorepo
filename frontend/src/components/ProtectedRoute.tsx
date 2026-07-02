'use client';

import React, { useEffect } from 'react';
import { useTenant } from '@/context/TenantContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export default function ProtectedRoute({ children, requiredRole = 'ADMIN' }: ProtectedRouteProps) {
  const { userRole, isLoadingTenant } = useTenant();
  const router = useRouter();

  useEffect(() => {
    if (!isLoadingTenant && userRole !== requiredRole) {
      toast.error('Acceso denegado: Privilegios insuficientes');
      router.push('/facturas');
    }
  }, [userRole, requiredRole, isLoadingTenant, router]);

  if (isLoadingTenant || userRole !== requiredRole) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}
