'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ModuleRegistry, AllCommunityModule, themeAlpine, RowDoubleClickedEvent } from 'ag-grid-community';
import toast from 'react-hot-toast';
import { getSession } from 'next-auth/react';
import { useTenant } from '@/context/TenantContext';
import AsientoGrid from '@/components/AsientoGrid';
import ProtectedRoute from '@/components/ProtectedRoute';

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

const EXPORTAR_DIARIO_QUERY = `
  query ExportarDiario($TenantId: String!, $Ejercicio: String!) {
    exportarDiario(TenantId: $TenantId, Ejercicio: $Ejercicio)
  }
`;

export default function DiarioPage() {
  const { tenantId, ejercicio } = useTenant();
  const gridRef = useRef<AgGridReact>(null);
  const [rowData, setRowData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [asientoIdSeleccionado, setAsientoIdSeleccionado] = useState<string | null>(null);

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [excluirCierre, setExcluirCierre] = useState<boolean>(true);

  const [colDefs] = useState<ColDef[]>([
    { field: 'Fecha', headerName: 'Fecha', sortable: true, filter: true, flex: 1 },
    { field: 'IdAsiento', headerName: 'Nº Asiento', sortable: true, filter: true, flex: 1 },
    { field: 'Linea', headerName: 'Línea', flex: 0.5 },
    { field: 'SubcuentaId', headerName: 'Subcuenta', sortable: true, filter: true, flex: 1 },
    { field: 'Concepto', headerName: 'Concepto', sortable: true, filter: true, flex: 2 },
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
        cache: 'no-store',
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

  const exportarCSV = async () => {
      if (!tenantId || !ejercicio) return;
      setExporting(true);
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
                  query: EXPORTAR_DIARIO_QUERY,
                  variables: { TenantId: tenantId, Ejercicio: ejercicio }
              })
          });

          const json = await res.json();
          if (json.errors) throw new Error(json.errors[0].message);

          const url = json.data.exportarDiario;
          window.open(url, '_blank');
          toast.success("Diario exportado con éxito");
      } catch (err: any) {
          toast.error('Error al exportar a CSV: ' + err.message);
      } finally {
          setExporting(false);
      }
  };

  const onRowDoubleClicked = (event: RowDoubleClickedEvent) => {
      const { IdAsiento } = event.data;
      if (IdAsiento) {
          setAsientoIdSeleccionado(IdAsiento);
          setModalOpen(true);
      }
  };

  const isExternalFilterPresent = useCallback(() => {
    return filtroTipo !== 'todos' || excluirCierre;
  }, [filtroTipo, excluirCierre]);

  const doesExternalFilterPass = useCallback((node: any) => {
    if (!node.data) return true;

    // Filtro por tipo de cuenta
    if (filtroTipo !== 'todos') {
      const subcuenta = node.data.SubcuentaId || '';
      if (filtroTipo === 'clientes' && !(subcuenta.startsWith('43') || subcuenta.startsWith('44'))) return false;
      if (filtroTipo === 'proveedores' && !(subcuenta.startsWith('40') || subcuenta.startsWith('41'))) return false;
      if (filtroTipo === 'bancos' && !subcuenta.startsWith('57')) return false;
      if (filtroTipo === 'ingresos_gastos' && !(subcuenta.startsWith('6') || subcuenta.startsWith('7'))) return false;
    }

    // Filtro de cierre
    if (excluirCierre) {
        const isCierre = node.data.IdAsiento === 'AST-CIERRE' || node.data.IdAsiento === 'AST-REGULARIZACION' || node.data.Concepto?.toLowerCase().includes('cierre') || node.data.Concepto?.toLowerCase().includes('regularización');
        if (isCierre) return false;
    }

    return true;
  }, [filtroTipo, excluirCierre]);

  useEffect(() => {
      if (gridRef.current?.api) {
          gridRef.current.api.onFilterChanged();
      }
  }, [filtroTipo, excluirCierre]);

  const handleModalClose = (recargar: boolean) => {
      setModalOpen(false);
      setAsientoIdSeleccionado(null);
      if (recargar) {
          cargarDiario();
      }
  };

  return (
    <ProtectedRoute requiredRole="ADMIN">
      <div className="h-full flex flex-col">
        <header className="mb-6 flex flex-col gap-4">
        <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Diario Histórico</h1>
              <p className="text-gray-500 mt-1">Listado cronológico de todos los apuntes contables del ejercicio {ejercicio}. Haz doble clic en una fila para editar el asiento completo.</p>
            </div>
            <button 
                onClick={exportarCSV} 
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
                {exporting ? 'Exportando...' : 'Exportar a CSV'}
            </button>
        </div>
        
        {/* Barra de Filtros */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row items-center gap-4 z-10">
            <div className="flex items-center gap-3 w-full sm:w-auto">
                <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">Filtrar por:</label>
                <select 
                    className="border border-gray-300 dark:border-gray-600 p-2 rounded-lg text-sm bg-white dark:bg-slate-900 font-medium text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-48"
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value)}
                >
                    <option value="todos">Todos los apuntes</option>
                    <option value="clientes">Clientes y Deudores (43, 44)</option>
                    <option value="proveedores">Proveedores y Acreedores (40, 41)</option>
                    <option value="bancos">Bancos y Cajas (57)</option>
                    <option value="ingresos_gastos">Ingresos y Gastos (6, 7)</option>
                </select>
            </div>
            
            <div className="flex items-center gap-2 bg-blue-50 text-blue-800 px-4 py-2 rounded-lg border border-blue-200 ml-auto w-full sm:w-auto">
                <input 
                    type="checkbox" 
                    id="excluirCierre" 
                    className="w-4 h-4 cursor-pointer accent-blue-600"
                    checked={excluirCierre}
                    onChange={(e) => setExcluirCierre(e.target.checked)}
                />
                <label htmlFor="excluirCierre" className="text-sm font-medium cursor-pointer select-none">
                    Ocultar asientos de Cierre / Regularización
                </label>
            </div>
        </div>
      </header>

      {error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
          {error}
        </div>
      ) : (
        <div className="flex-1 w-full bg-white dark:bg-slate-900 rounded-lg shadow-sm border overflow-hidden">
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
              isExternalFilterPresent={isExternalFilterPresent}
              doesExternalFilterPass={doesExternalFilterPass}
            />
          )}
        </div>
      )}

      {/* Modal de Edición */}
      {modalOpen && asientoIdSeleccionado && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="p-4 border-b flex justify-between items-center bg-gray-50 dark:bg-slate-800">
                      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                          Editando Asiento <span className="text-blue-600">#{asientoIdSeleccionado}</span>
                      </h3>
                      <button 
                          onClick={() => handleModalClose(false)}
                          className="text-gray-500 hover:text-gray-800 dark:text-gray-200 p-2"
                      >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 bg-white dark:bg-slate-900">
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
    </ProtectedRoute>
  );
}
