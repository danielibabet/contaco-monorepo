import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { TenantProvider } from "@/context/TenantContext";
import { LayoutClientWrapper } from "@/components/LayoutClientWrapper";
import { ThemeProvider } from "@/components/ThemeProvider";

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
      <body className={`${inter.className} bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased min-h-screen flex transition-colors`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Providers>
            <TenantProvider>
              <LayoutClientWrapper>
                {children}
              </LayoutClientWrapper>
            </TenantProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
