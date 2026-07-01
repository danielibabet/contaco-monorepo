import AsientoGrid from "@/components/AsientoGrid";

export default function Home() {
  return (
    <div className="flex flex-col gap-6 h-screen">
      <header className="border-b border-slate-200 dark:border-slate-700 pb-5 mb-2">
        <h1 className="text-3xl font-black text-slate-900">Introducción Rápida de Asientos</h1>
        <p className="text-slate-500 mt-2 font-medium">
          Introduce apuntes al vuelo. Los atajos de teclado de Contaplus están habilitados.
        </p>
      </header>
      
      <main className="flex-1 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <AsientoGrid />
      </main>
    </div>
  );
}
