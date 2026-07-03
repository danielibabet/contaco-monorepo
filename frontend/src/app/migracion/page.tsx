'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { useTenant } from '@/context/TenantContext';
import { getSession } from 'next-auth/react';

const GENERAR_URL_SUBIDA = `
  mutation GenerarUrlSubida($TenantId: String!, $Ejercicio: String!, $IdAsiento: String!, $Filename: String!) {
    generarUrlSubida(TenantId: $TenantId, Ejercicio: $Ejercicio, IdAsiento: $IdAsiento, NombreArchivo: $Filename) {
      UploadUrl: Url
      FileKey: S3Key
    }
  }
`;



export default function MigracionPage() {
  const { tenantId, ejercicio } = useTenant();
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const fetchGraphQL = async (query: string, variables: any) => {
      const session: any = await getSession();
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': session?.accessToken || ''
          },
          cache: 'no-store',
          body: JSON.stringify({ query, variables })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      return json.data;
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('Por favor, selecciona un archivo .ZIP válido (ej. backup.zip).');
      return;
    }

    if (!tenantId || !ejercicio) {
        toast.error('Selecciona una empresa y ejercicio activo primero.');
        return;
    }

    setIsUploading(true);
    setResult(null);

    const loadingToast = toast.loading('Paso 1/2: Subiendo copia de seguridad a AWS...', { id: 'migracion' });

    try {
        // 1. Obtener URL pre-firmada
        const uploadData = await fetchGraphQL(GENERAR_URL_SUBIDA, {
            TenantId: tenantId,
            Ejercicio: ejercicio,
            IdAsiento: "MIGRACION",
            Filename: file.name
        });
        
        const { UploadUrl, FileKey } = uploadData.generarUrlSubida;

        // 2. Subir el archivo a S3
        const putRes = await fetch(UploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': 'application/octet-stream' }
        });

        if (!putRes.ok) throw new Error("Error al subir el archivo a S3");

        // 3. Procesar archivo en backend (puede tardar hasta 2 minutos)
        toast.success('¡Archivo subido! Procesando en background...', { id: loadingToast, duration: 8000 });
        setResult("La importación masiva se está ejecutando en segundo plano. Los apuntes irán apareciendo en el Diario a lo largo de los próximos minutos a medida que SQS los procese.");
        
    } catch (error: any) {
        console.error("Migración error:", error);
        toast.error(`Error: ${error.message}`, { id: loadingToast, duration: 8000 });
        setResult(null);
    } finally {
        setIsUploading(false);
    }
  }, [tenantId, ejercicio]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <header className="border-b border-slate-200 dark:border-slate-700 pb-5">
        <h1 className="text-3xl font-black text-slate-900">Migración directa de ContaPlus</h1>
        <p className="text-slate-500 mt-2 font-medium">
          Sube tu copia de seguridad estructurada en <strong className="text-indigo-600">.ZIP</strong>. SQS procesará los archivos DBF en segundo plano para evitar bloqueos.
        </p>
      </header>
      
      <div 
        {...getRootProps()} 
        className={`tour-step-dropzone border-2 border-dashed rounded-2xl p-14 text-center transition-all ${
          isUploading ? 'opacity-50 cursor-not-allowed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800' : 
          isDragActive ? 'border-indigo-500 bg-indigo-50 cursor-pointer scale-105 shadow-md' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer shadow-sm'
        }`}
      >
        <input {...getInputProps()} disabled={isUploading} accept=".zip" />
        <div className="flex flex-col items-center gap-4">
          <svg className="w-14 h-14 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          {isDragActive ? (
            <p className="text-xl font-black text-indigo-600">Suelta tu archivo DAT aquí...</p>
          ) : (
            <div>
              <p className="text-lg font-bold text-slate-700 dark:text-slate-300">Arrastra y suelta tu copia de seguridad (.ZIP) aquí</p>
              <p className="text-sm font-medium text-slate-500 mt-2">o haz clic para explorar tus carpetas</p>
            </div>
          )}
        </div>
      </div>

      {isUploading && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            <div>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 block">Subiendo a AWS...</span>
                <span className="text-xs text-slate-500">Por favor no cierres la página hasta que finalice la subida a S3.</span>
            </div>
        </div>
      )}

      {result && !isUploading && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-green-800 mb-2">🎉 Restauración Completada</h3>
          <p className="text-green-700">{result}</p>
        </div>
      )}
    </div>
  );
}
