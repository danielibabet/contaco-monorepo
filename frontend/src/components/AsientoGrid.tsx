'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellKeyDownEvent, GridReadyEvent, ModuleRegistry, AllCommunityModule, themeAlpine } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

import { getSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { useTenant } from '@/context/TenantContext';
import SubcuentaCellEditor from './SubcuentaCellEditor';

// GraphQL Mutation string para fetch
const CREAR_ASIENTO_MUTATION = `
  mutation CrearAsiento($input: CrearAsientoInput!) {
    crearAsiento(input: $input) {
      IdAsiento
    }
  }
`;

const EDITAR_ASIENTO_MUTATION = `
  mutation EditarAsiento($input: EditarAsientoInput!) {
    editarAsiento(input: $input) {
      IdAsiento
    }
  }
`;

const BORRAR_ASIENTO_MUTATION = `
  mutation BorrarAsiento($TenantId: String!, $Ejercicio: String!, $IdAsiento: String!) {
    borrarAsiento(TenantId: $TenantId, Ejercicio: $Ejercicio, IdAsiento: $IdAsiento)
  }
`;

interface ApunteRow {
  Linea: string;
  SubcuentaId: string;
  Concepto: string;
  Documento: string;
  Debe: number | null;
  Haber: number | null;
}

const defaultRow: ApunteRow = { Linea: '1', SubcuentaId: '', Concepto: '', Documento: '', Debe: null, Haber: null };

interface AsientoGridProps {
  asientoIdToEdit?: string;
  apuntesToEdit?: any[];
  onSaved?: () => void;
}

export default function AsientoGrid({ asientoIdToEdit, apuntesToEdit, onSaved }: AsientoGridProps) {
  const { tenantId, ejercicio } = useTenant();
  const gridRef = useRef<AgGridReact>(null);
  const [rowData, setRowData] = useState<ApunteRow[]>([{ ...defaultRow }]);
  const [loading, setLoading] = useState(false);
  const [fechaAsiento, setFechaAsiento] = useState(new Date().toISOString().split('T')[0]);

  // Cargar datos si estamos en modo edición
  useEffect(() => {
      if (asientoIdToEdit && apuntesToEdit && apuntesToEdit.length > 0) {
          const loadedRows = apuntesToEdit.map(a => ({
              Linea: a.Linea,
              SubcuentaId: a.SubcuentaId,
              Concepto: a.Concepto,
              Documento: a.Documento || '',
              Debe: a.Debe || null,
              Haber: a.Haber || null,
          }));
          setRowData([...loadedRows, { ...defaultRow, Linea: String(loadedRows.length + 1) }]);
          setFechaAsiento(apuntesToEdit[0].Fecha);
      }
  }, [asientoIdToEdit, apuntesToEdit]);

  // Columnas del Grid
  const [colDefs] = useState<ColDef[]>([
    { field: 'SubcuentaId', headerName: 'Subcuenta', editable: true, flex: 1, cellEditor: SubcuentaCellEditor },
    { field: 'Concepto', headerName: 'Concepto', editable: true, flex: 2 },
    { field: 'Documento', headerName: 'Documento', editable: true, flex: 1 },
    { field: 'Debe', headerName: 'Debe', editable: true, type: 'numericColumn', flex: 1, valueParser: (params) => Number(params.newValue) || null },
    { field: 'Haber', headerName: 'Haber', editable: true, type: 'numericColumn', flex: 1, valueParser: (params) => Number(params.newValue) || null },
  ]);

  // Atajo "+" para cuadrar asiento
  const handleCellKeyDown = useCallback((e: CellKeyDownEvent) => {
    const keyboardEvent = e.event as KeyboardEvent;
    
    if (keyboardEvent.key === '+') {
      const field = e.colDef.field;
      if (field === 'Debe' || field === 'Haber') {
        keyboardEvent.preventDefault(); // Evitar que escriba el "+"
        
        let totalDebe = 0;
        let totalHaber = 0;
        
        gridRef.current!.api.forEachNode((node) => {
            // Ignorar la fila actual
            if (node.rowIndex !== e.rowIndex) {
                totalDebe += Number(node.data.Debe) || 0;
                totalHaber += Number(node.data.Haber) || 0;
            }
        });

        // Calcular descuadre
        const dif = Math.abs(totalDebe - totalHaber);
        if (dif > 0) {
            const newValue = (field === 'Debe' && totalHaber > totalDebe) ? dif : 
                             (field === 'Haber' && totalDebe > totalHaber) ? dif : 0;
                             
            if (newValue > 0) {
                const node = gridRef.current!.api.getRowNode(e.node.id!);
                node?.setDataValue(field, newValue);
                
                // Si estamos editando, detener edición y actualizar
                gridRef.current!.api.stopEditing();
            }
        }
      }
    }
  }, []);

  // Grabar Asiento
  const handleSave = async () => {
    gridRef.current?.api.stopEditing(); // Termina cualquier edición activa
    
    let totalDebe = 0;
    let totalHaber = 0;
    const apuntesValidos: any[] = [];
    
    gridRef.current!.api.forEachNode((node) => {
        const d = node.data as ApunteRow;
        console.log("Fila Data:", d);
        if (d.SubcuentaId && (d.Debe || d.Haber)) {
            apuntesValidos.push({
                SubcuentaId: d.SubcuentaId,
                Concepto: d.Concepto,
                Documento: d.Documento,
                Debe: Number(d.Debe) || 0,
                Haber: Number(d.Haber) || 0,
            });
            totalDebe += Number(d.Debe) || 0;
            totalHaber += Number(d.Haber) || 0;
        }
    });

    if (apuntesValidos.length === 0) {
        toast.error("El asiento está vacío. Mira la consola para ver qué data tiene la fila.");
        return;
    }

    if (totalDebe !== totalHaber) {
        toast.error(`Asiento descuadrado. Diferencia: ${Math.abs(totalDebe - totalHaber).toFixed(2)}`);
        return;
    }

    try {
        setLoading(true);
        const session: any = await getSession();
        
        const mutation = asientoIdToEdit ? EDITAR_ASIENTO_MUTATION : CREAR_ASIENTO_MUTATION;
        const variables = {
            input: {
                TenantId: tenantId,
                Ejercicio: ejercicio,
                Fecha: fechaAsiento,
                Usuario: "admin",
                Apuntes: apuntesValidos,
                ...(asientoIdToEdit ? { IdAsiento: asientoIdToEdit } : {})
            }
        };

        const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': session?.accessToken || ''
            },
            body: JSON.stringify({ query: mutation, variables })
        });

        const data = await res.json();
        
        if (data.errors) {
            throw new Error(data.errors[0].message);
        }

        if (onSaved) onSaved();
        
        if (!asientoIdToEdit) {
            setRowData([{ ...defaultRow }]); // Limpiar grid solo si es nuevo
        }
    } catch (error: any) {
        toast.error(error.message || "Error al grabar el asiento");
    } finally {
        setLoading(false);
    }
  };

  // Atajo Ctrl+S global
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const handleDelete = async () => {
      if (!asientoIdToEdit) return;
      if (!confirm("¿Estás seguro de que deseas eliminar este asiento por completo? Esta acción es irreversible.")) return;

      try {
          setLoading(true);
          const session: any = await getSession();
          const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
              body: JSON.stringify({
                  query: BORRAR_ASIENTO_MUTATION,
                  variables: { TenantId: tenantId, Ejercicio: ejercicio, IdAsiento: asientoIdToEdit }
              })
          });

          const data = await res.json();
          if (data.errors) throw new Error(data.errors[0].message);

          toast.success("Asiento eliminado correctamente");
          if (onSaved) onSaved();
      } catch (error: any) {
          toast.error(error.message || "Error al eliminar el asiento");
      } finally {
          setLoading(false);
      }
  };

  const onGridReady = (params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  };

  // Añadir nueva fila vacía automáticamente si llenamos la última
  const onCellValueChanged = (event: any) => {
    const lastRowIndex = gridRef.current!.api.getDisplayedRowCount() - 1;
    if (event.rowIndex === lastRowIndex && (event.data.Debe || event.data.Haber)) {
      setRowData(prev => [...prev, { ...defaultRow, Linea: String(prev.length + 1) }]);
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex justify-between items-center">
        {!asientoIdToEdit && <h2 className="text-xl font-bold">Nuevo Asiento Diario</h2>}
        
        <div className="flex gap-4 items-center ml-auto">
            {asientoIdToEdit && (
                <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-gray-600">Fecha del Asiento:</label>
                    <input 
                        type="date" 
                        value={fechaAsiento}
                        onChange={(e) => setFechaAsiento(e.target.value)}
                        className="border rounded p-1 text-sm"
                    />
                </div>
            )}
            
            {asientoIdToEdit && (
                <button 
                    onClick={handleDelete}
                    disabled={loading}
                    className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-md transition-colors border border-red-200"
                >
                    Eliminar Asiento
                </button>
            )}

            <button 
                onClick={handleSave} 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors shadow-sm"
            >
                {loading ? 'Procesando...' : (asientoIdToEdit ? 'Actualizar Asiento' : 'Grabar Asiento (Ctrl+S)')}
            </button>
        </div>
      </div>

      <div className="w-full h-[400px]">
        <AgGridReact
          ref={gridRef}
          theme={themeAlpine}
          rowData={rowData}
          columnDefs={colDefs}
          onGridReady={onGridReady}
          onCellKeyDown={handleCellKeyDown}
          onCellValueChanged={onCellValueChanged}
          singleClickEdit={true} // Edición ultrarrápida
          enterNavigatesVertically={true} // UX Desktop
          enterNavigatesVerticallyAfterEdit={true}
        />
      </div>
      <p className="text-sm text-gray-500">
        💡 <strong>Atajos:</strong> Usa <kbd className="bg-gray-100 p-1 rounded">Tab</kbd> o <kbd className="bg-gray-100 p-1 rounded">Enter</kbd> para moverte. 
        Pulsa <kbd className="bg-gray-100 p-1 rounded">+</kbd> en Debe/Haber para cuadrar automático.
      </p>
    </div>
  );
}
