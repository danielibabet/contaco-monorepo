import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { TenantProvider } from "@/context/TenantContext";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ContaCo - Contabilidad Cloud",
  description: "Plataforma web contable moderna basada en AWS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased min-h-screen flex`} suppressHydrationWarning>
        <Providers>
          <TenantProvider>
            <Sidebar />
            <main className="flex-1 ml-64 p-6 md:p-10 h-screen overflow-y-auto">
              {children}
            </main>
          </TenantProvider>
        </Providers>
      </body>
    </html>
  );
}
