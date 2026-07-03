'use client';

import { Toaster } from 'react-hot-toast';
import { SessionProvider } from 'next-auth/react';
import { TourProvider } from '@/context/TourContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TourProvider>
        {children}
        <Toaster position="top-right" />
      </TourProvider>
    </SessionProvider>
  );
}
