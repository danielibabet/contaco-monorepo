"use client";
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export function LayoutClientWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname === '/login' || pathname === '/register' || pathname === '/verify';

  return (
    <>
      {!isAuthRoute && <Sidebar />}
      <main className={`flex-1 ${isAuthRoute ? '' : 'ml-64 p-6 md:p-10'} h-screen overflow-y-auto`}>
        {children}
      </main>
    </>
  );
}
