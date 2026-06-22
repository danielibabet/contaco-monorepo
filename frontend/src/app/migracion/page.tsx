'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { useTenant } from '@/context/TenantContext';

export default function MigracionPage() {
  const { tenantId, ejercicio } = useTenant();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<any>(null);

  const uploadInChunks = async (putRequests: any[]) => {
    const chunkSize = 25;
    let imported = 0;
    const errors: string[] = [];

    setTotal(putRequests.length);
    setProgress(0);

    for (let i = 0; i < putRequests.length; i += chunkSize) {
      const chunk = putRequests.slice(i, i + chunkSize);
      
      try {
        const res = await fetch('/api/import-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunk })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Error al procesar lote');
        }

        imported += data.processed;
        if (data.unprocessed > 0) {
          errors.push(`Lote ${i/chunkSize}: ${data.unprocessed} items no procesados`);
        }
        
        setProgress(imported);
      } catch (err: any) {
        errors.push(`Error crítico en lote ${i/chunkSize}: ${err.message}`);
      }
    }

    setResult({
      totalImported: imported,
      totalRecords: putRequests.length,
      errors: errors.length > 0 ? errors : undefined
    });
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    if (!file.name.toLowerCase().endsWith('.dbf')) {
      toast.error('Por favor, selecciona un archivo .dbf válido.');
      return;
    }

    setIsUploading(true);
    setResult(null);
    setProgress(0);
    setTotal(0);

    try {
      toast.loading('Analizando el archivo (puede tardar unos segundos)...', { id: 'parsing' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', tenantId);
      formData.append('ejercicio', ejercicio);

      // 1. Parsear el archivo en el backend para obtener las Peticiones JSON
      const resParse = await fetch('/api/parse-dbf', {
        method: 'POST',
        body: formData,
      });

      const dataParse = await resParse.json();

      if (!resParse.ok) {
        throw new Error(dataParse.error || 'Error al parsear el archivo');
      }

      toast.success('Archivo parseado. Iniciando inyección en AWS...', { id: 'parsing' });

      // 2. Ejecutar la subida iterativa con barra de progreso
      if (dataParse.putRequests && dataParse.putRequests.length > 0) {
        await uploadInChunks(dataParse.putRequests);
        toast.success('Inyección finalizada', { duration: 4000 });
      } else {
         toast.error("El archivo no contenía registros válidos");
      }

    } catch (error: any) {
      toast.error(error.message, { id: 'parsing' });
    } finally {
      setIsUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/dbf': ['.dbf'] } });

  const progressPercent = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <header className="border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-800">Migración desde Contaplus</h1>
        <p className="text-gray-500 mt-1">
          Sube tus archivos históricos (ej. SUBCUEN.DBF o DIARIO.DBF) para importarlos a la nube.
        </p>
      </header>
      
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          isUploading ? 'opacity-50 cursor-not-allowed border-gray-300 bg-gray-50' : 
          isDragActive ? 'border-blue-500 bg-blue-50 cursor-pointer' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer'
        }`}
      >
        <input {...getInputProps()} disabled={isUploading} />
        <div className="flex flex-col items-center gap-3">
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          {isDragActive ? (
            <p className="text-lg font-medium text-blue-600">Suelta el archivo aquí...</p>
          ) : (
            <div>
              <p className="text-lg font-medium text-gray-700">Arrastra y suelta tu archivo .dbf aquí</p>
              <p className="text-sm text-gray-500 mt-1">o haz clic para seleccionar el archivo manualmente</p>
            </div>
          )}
        </div>
      </div>

      {isUploading && total > 0 && (
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-gray-700">Subiendo a AWS DynamoDB...</span>
            <span className="text-sm font-bold text-blue-600">{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div 
              className="bg-blue-600 h-4 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-right">
            Lote {Math.ceil(progress / 25)} / {Math.ceil(total / 25)} (Total procesados: {progress} / {total})
          </p>
        </div>
      )}

      {result && !isUploading && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-green-800 mb-2">Importación Completada</h3>
          <p className="text-green-700">Se han subido <strong>{result.totalImported}</strong> de <strong>{result.totalRecords}</strong> registros a la base de datos.</p>
          
          {result.errors && result.errors.length > 0 && (
            <div className="mt-4 bg-red-50 p-4 rounded border border-red-200 h-48 overflow-y-auto">
                <h4 className="font-bold text-red-800 text-sm sticky top-0 bg-red-50">Advertencias / Errores:</h4>
                <ul className="list-disc ml-5 mt-2 text-sm text-red-700">
                    {result.errors.map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                    ))}
                </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
