'use client';

import React, { useState } from 'react';
import { getSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { useTenant } from '@/context/TenantContext';

const CERRAR_EJERCICIO_MUTATION = `
  mutation CerrarEjercicio($TenantId: String!, $EjercicioActual: String!, $EjercicioNuevo: String!) {
    cerrarEjercicio(TenantId: $TenantId, EjercicioActual: $EjercicioActual, EjercicioNuevo: $EjercicioNuevo)
  }
`;

export default function CierrePage() {
  const { tenantId, ejercicio } = useTenant();
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const ejercicioActual = ejercicio;
  const ejercicioNuevo = (parseInt(ejercicio) + 1).toString();

  const ejecutarCierre = async () => {
    if (confirmText !== 'CERRAR') return;

    setShowModal(false);
    setLoading(true);
    const loadingToast = toast.loading('Procesando cierre automático (generando cientos de apuntes)...');

    try {
      const session: any = await getSession();
      if (!session?.accessToken) throw new Error("No autenticado");

      const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session.accessToken,
        },
        body: JSON.stringify({
          query: CERRAR_EJERCICIO_MUTATION,
          variables: { 
            TenantId: tenantId, 
            EjercicioActual: ejercicioActual,
            EjercicioNuevo: ejercicioNuevo
          }
        })
      });

      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);

      toast.success('¡Cierre de ejercicio completado con éxito!', { id: loadingToast });
      setConfirmText('');
    } catch (error: any) {
      toast.error(error.message || 'Error durante el cierre de ejercicio', { id: loadingToast });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Cierre de Ejercicio</h1>
        <p className="text-gray-500 mt-2">Automatiza la transición contable al nuevo año. Este proceso generará automáticamente los asientos de regularización, cierre y apertura.</p>
      </header>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-red-200">
        <h2 className="text-xl font-semibold text-red-600 flex items-center gap-2 mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          Danger Zone
        </h2>
        
        <p className="text-gray-700 mb-6 leading-relaxed">
          Estás a punto de ejecutar el cierre del ejercicio <strong>{ejercicioActual}</strong>. 
          Este proceso es masivo e irreversible y realizará las siguientes acciones en tu contabilidad:
        </p>
        
        <ul className="list-disc list-inside text-gray-600 mb-8 space-y-2">
          <li>Saldará a cero todas las cuentas de los Grupos 6 y 7, traspasando el resultado a la 12900000.</li>
          <li>Generará el Asiento de Cierre (31/12) invirtiendo el saldo de las cuentas de los Grupos 1 al 5.</li>
          <li>Generará el Asiento de Apertura (01/01) para el nuevo ejercicio <strong>{ejercicioNuevo}</strong> con los saldos iniciales.</li>
        </ul>

        <button 
          onClick={() => setShowModal(true)}
          disabled={loading}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          {loading ? 'Ejecutando Cierre...' : 'Ejecutar Cierre Anual'}
        </button>
      </div>

      {/* Modal de Confirmación */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Confirmar Cierre Anual</h3>
            <p className="text-sm text-gray-500 mb-6">
              Para evitar ejecuciones accidentales, por favor escribe la palabra <strong className="text-red-600">CERRAR</strong> para habilitar el botón.
            </p>
            
            <input 
              type="text" 
              className="w-full border-gray-300 rounded-lg shadow-sm focus:border-red-500 focus:ring-red-500 mb-6"
              placeholder="Escribe CERRAR..."
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
            
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => { setShowModal(false); setConfirmText(''); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={ejecutarCierre}
                disabled={confirmText !== 'CERRAR'}
                className="px-4 py-2 bg-red-600 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700"
              >
                Confirmar y Ejecutar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
