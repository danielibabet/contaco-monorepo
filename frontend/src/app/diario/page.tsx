'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ModuleRegistry, AllCommunityModule, themeAlpine, RowDoubleClickedEvent } from 'ag-grid-community';
import toast from 'react-hot-toast';
import { getSession } from 'next-auth/react';
import { useTenant } from '@/context/TenantContext';
import AsientoGrid from '@/components/AsientoGrid';

ModuleRegistry.registerModules([AllCommunityModule]);

const OBTENER_DIARIO_QUERY = `
  query ObtenerDiario($TenantId: String!, $Ejercicio: String!) {
    obtenerDiario(TenantId: $TenantId, Ejercicio: $Ejercicio) {
      IdAsiento
      Linea
      Fecha
      SubcuentaId
      Concepto
      Documento
      Debe
      Haber
    }
  }
`;

export default function DiarioPage() {
  const { tenantId, ejercicio } = useTenant();
  const gridRef = useRef<AgGridReact>(null);
  const [rowData, setRowData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado del Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [asientoIdSeleccionado, setAsientoIdSeleccionado] = useState<string | null>(null);

  const [colDefs] = useState<ColDef[]>([
    { field: 'Fecha', headerName: 'Fecha', sortable: true, filter: true, flex: 1 },
    { field: 'IdAsiento', headerName: 'Nº Asiento', sortable: true, filter: true, flex: 1 },
    { field: 'Linea', headerName: 'Línea', flex: 0.5 },
    { field: 'SubcuentaId', headerName: 'Subcuenta', sortable: true, filter: true, flex: 1 },
    { field: 'Concepto', headerName: 'Concepto', sortable: true, filter: true, flex: 2 },
    { field: 'Documento', headerName: 'Doc.', flex: 1 },
    { field: 'Debe', headerName: 'Debe', flex: 1, type: 'numericColumn', valueFormatter: params => params.value ? params.value.toLocaleString('es-ES', {style:'currency', currency:'EUR'}) : '' },
    { field: 'Haber', headerName: 'Haber', flex: 1, type: 'numericColumn', valueFormatter: params => params.value ? params.value.toLocaleString('es-ES', {style:'currency', currency:'EUR'}) : '' },
  ]);

  const cargarDiario = useCallback(async () => {
    if (!tenantId || !ejercicio) return;
    
    setLoading(true);
    setError(null);
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
          query: OBTENER_DIARIO_QUERY,
          variables: { TenantId: tenantId, Ejercicio: ejercicio }
        })
      });

      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);

      const apuntes = json.data.obtenerDiario || [];
      
      // Ordenar por Fecha ascendente, luego IdAsiento, luego Linea
      apuntes.sort((a: any, b: any) => {
          if (a.Fecha !== b.Fecha) return a.Fecha.localeCompare(b.Fecha);
          if (a.IdAsiento !== b.IdAsiento) return a.IdAsiento.localeCompare(b.IdAsiento);
          return parseInt(a.Linea) - parseInt(b.Linea);
      });

      setRowData(apuntes);
    } catch (err: any) {
      setError(err.message || 'Error desconocido');
      toast.error('Error al cargar el Diario');
    } finally {
      setLoading(false);
    }
  }, [tenantId, ejercicio]);

  useEffect(() => {
    cargarDiario();
  }, [cargarDiario]);

  const onRowDoubleClicked = (event: RowDoubleClickedEvent) => {
      const { IdAsiento } = event.data;
      if (IdAsiento) {
          setAsientoIdSeleccionado(IdAsiento);
          setModalOpen(true);
      }
  };

  const handleModalClose = (recargar: boolean) => {
      setModalOpen(false);
      setAsientoIdSeleccionado(null);
      if (recargar) {
          cargarDiario();
      }
  };

  return (
    <div className="h-full flex flex-col">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Diario Histórico</h1>
          <p className="text-gray-500 mt-1">Listado cronológico de todos los apuntes contables del ejercicio {ejercicio}. Haz doble clic en una fila para editar el asiento completo.</p>
        </div>
      </header>

      {error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
          {error}
        </div>
      ) : (
        <div className="flex-1 w-full bg-white rounded-lg shadow-sm border overflow-hidden">
          {loading && rowData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              Cargando diario...
            </div>
          ) : (
            <AgGridReact
              ref={gridRef}
              theme={themeAlpine}
              rowData={rowData}
              columnDefs={colDefs}
              animateRows={true}
              onRowDoubleClicked={onRowDoubleClicked}
            />
          )}
        </div>
      )}

      {/* Modal de Edición */}
      {modalOpen && asientoIdSeleccionado && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                      <h3 className="text-xl font-bold text-gray-800">
                          Editando Asiento <span className="text-blue-600">#{asientoIdSeleccionado}</span>
                      </h3>
                      <button 
                          onClick={() => handleModalClose(false)}
                          className="text-gray-500 hover:text-gray-800 p-2"
                      >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 bg-white">
                      <AsientoGrid 
                          asientoIdToEdit={asientoIdSeleccionado} 
                          apuntesToEdit={rowData.filter(r => r.IdAsiento === asientoIdSeleccionado)}
                          onSaved={() => handleModalClose(true)} 
                      />
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
