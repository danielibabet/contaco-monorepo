import AsientoGrid from "@/components/AsientoGrid";

export default function Home() {
  return (
    <div className="flex flex-col gap-6 h-screen">
      <header className="border-b pb-4 mb-4">
        <h1 className="text-3xl font-bold text-gray-800">Introducción Rápida de Asientos</h1>
        <p className="text-gray-500 mt-1">
          Introduce apuntes al vuelo. Los atajos de teclado de Contaplus están habilitados.
        </p>
      </header>
      
      <main className="flex-1 bg-white rounded-lg shadow-sm border p-4">
        <AsientoGrid />
      </main>
    </div>
  );
}
