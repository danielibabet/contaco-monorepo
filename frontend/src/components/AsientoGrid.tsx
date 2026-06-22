'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellKeyDownEvent, GridReadyEvent, ModuleRegistry, AllCommunityModule, themeAlpine } from 'ag-grid-community';
import { useDropzone } from 'react-dropzone';

ModuleRegistry.registerModules([AllCommunityModule]);

import { getSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { useTenant } from '@/context/TenantContext';
import SubcuentaCellEditor from './SubcuentaCellEditor';

const CREAR_ASIENTO_MUTATION = `
  mutation CrearAsiento($input: CrearAsientoInput!) {
    crearAsiento(input: $input) { IdAsiento }
  }
`;

const EDITAR_ASIENTO_MUTATION = `
  mutation EditarAsiento($input: EditarAsientoInput!) {
    editarAsiento(input: $input) { IdAsiento }
  }
`;

const OBTENER_ASIENTO_QUERY = `
  query ObtenerAsiento($TenantId: String!, $Ejercicio: String!, $IdAsiento: String!) {
    obtenerAsiento(TenantId: $TenantId, Ejercicio: $Ejercicio, IdAsiento: $IdAsiento) {
      Documentos {
        S3Key
        Nombre
      }
    }
  }
`;

const GENERAR_URL_SUBIDA_MUTATION = `
  mutation GenerarUrlSubida($TenantId: String!, $Ejercicio: String!, $IdAsiento: String!, $NombreArchivo: String!) {
    generarUrlSubida(TenantId: $TenantId, Ejercicio: $Ejercicio, IdAsiento: $IdAsiento, NombreArchivo: $NombreArchivo) {
      Url
      S3Key
    }
  }
`;

const OBTENER_URL_DESCARGA_QUERY = `
  query ObtenerUrlDescarga($S3Key: String!) {
    obtenerUrlDescarga(S3Key: $S3Key)
  }
`;

const LISTAR_PLANTILLAS_QUERY = `
  query ListarPlantillas($TenantId: String!) {
    listarPlantillas(TenantId: $TenantId) {
      TemplateId
      NombrePlantilla
      Lineas {
        SubcuentaId
        Concepto
        Porcentaje
        Columna
      }
    }
  }
`;

const CREAR_PLANTILLA_MUTATION = `
  mutation CrearPlantilla($input: CrearPlantillaInput!) {
    crearPlantilla(input: $input) { TemplateId }
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

  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<string>('');
  
  // Modals de Plantillas
  const [modalGuardarPlantilla, setModalGuardarPlantilla] = useState(false);
  const [modalCargarPlantilla, setModalCargarPlantilla] = useState(false);
  const [nombreNuevaPlantilla, setNombreNuevaPlantilla] = useState('');
  const [lineaBaseIndex, setLineaBaseIndex] = useState<number>(0);
  const [importeBase, setImporteBase] = useState<number>(0);

  // Documentos
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [subiendoDoc, setSubiendoDoc] = useState(false);

  const cargarPlantillas = useCallback(async () => {
      if (!tenantId) return;
      try {
          const session: any = await getSession();
          const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
              body: JSON.stringify({
                  query: LISTAR_PLANTILLAS_QUERY,
                  variables: { TenantId: tenantId }
              })
          });
          const json = await res.json();
          if (json.data?.listarPlantillas) {
              setPlantillas(json.data.listarPlantillas);
          }
      } catch (err) {
          console.error("Error al cargar plantillas:", err);
      }
  }, [tenantId]);

  const cargarAsientoDocs = useCallback(async () => {
      if (!asientoIdToEdit) return;
      try {
          const session: any = await getSession();
          const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
              body: JSON.stringify({
                  query: OBTENER_ASIENTO_QUERY,
                  variables: { TenantId: tenantId, Ejercicio: ejercicio, IdAsiento: asientoIdToEdit }
              })
          });
          const json = await res.json();
          if (json.data?.obtenerAsiento?.Documentos) {
              setDocumentos(json.data.obtenerAsiento.Documentos);
          }
      } catch (err) {
          console.error("Error al cargar documentos del asiento:", err);
      }
  }, [tenantId, ejercicio, asientoIdToEdit]);

  useEffect(() => {
      cargarPlantillas();
  }, [cargarPlantillas]);

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
          
          cargarAsientoDocs();
      }
  }, [asientoIdToEdit, apuntesToEdit, cargarAsientoDocs]);

  const [colDefs] = useState<ColDef[]>([
    { field: 'SubcuentaId', headerName: 'Subcuenta', editable: true, flex: 1, cellEditor: SubcuentaCellEditor },
    { field: 'Concepto', headerName: 'Concepto', editable: true, flex: 2 },
    { field: 'Documento', headerName: 'Documento', editable: true, flex: 1 },
    { field: 'Debe', headerName: 'Debe', editable: true, type: 'numericColumn', flex: 1, valueParser: (params) => Number(params.newValue) || null },
    { field: 'Haber', headerName: 'Haber', editable: true, type: 'numericColumn', flex: 1, valueParser: (params) => Number(params.newValue) || null },
  ]);

  const handleCellKeyDown = useCallback((e: CellKeyDownEvent) => {
    const keyboardEvent = e.event as KeyboardEvent;
    
    if (keyboardEvent.key === '+') {
      const field = e.colDef.field;
      if (field === 'Debe' || field === 'Haber') {
        keyboardEvent.preventDefault();
        
        let totalDebe = 0;
        let totalHaber = 0;
        
        gridRef.current!.api.forEachNode((node) => {
            if (node.rowIndex !== e.rowIndex) {
                totalDebe += Number(node.data.Debe) || 0;
                totalHaber += Number(node.data.Haber) || 0;
            }
        });

        const dif = Math.abs(totalDebe - totalHaber);
        if (dif > 0) {
            const newValue = (field === 'Debe' && totalHaber > totalDebe) ? dif : 
                             (field === 'Haber' && totalDebe > totalHaber) ? dif : 0;
                             
            if (newValue > 0) {
                const node = gridRef.current!.api.getRowNode(e.node.id!);
                node?.setDataValue(field, newValue);
                gridRef.current!.api.stopEditing();
            }
        }
      }
    }
  }, []);

  const handleSave = async () => {
    gridRef.current?.api.stopEditing();
    let totalDebe = 0;
    let totalHaber = 0;
    const apuntesValidos: any[] = [];
    
    gridRef.current!.api.forEachNode((node) => {
        const d = node.data as ApunteRow;
        if (d.SubcuentaId && (d.Debe || d.Haber)) {
            apuntesValidos.push({
                SubcuentaId: d.SubcuentaId, Concepto: d.Concepto, Documento: d.Documento,
                Debe: Number(d.Debe) || 0, Haber: Number(d.Haber) || 0,
            });
            totalDebe += Number(d.Debe) || 0;
            totalHaber += Number(d.Haber) || 0;
        }
    });

    if (apuntesValidos.length === 0) return toast.error("El asiento está vacío.");
    if (totalDebe !== totalHaber) return toast.error(`Asiento descuadrado. Diferencia: ${Math.abs(totalDebe - totalHaber).toFixed(2)}`);

    try {
        setLoading(true);
        const session: any = await getSession();
        const mutation = asientoIdToEdit ? EDITAR_ASIENTO_MUTATION : CREAR_ASIENTO_MUTATION;
        const variables = {
            input: {
                TenantId: tenantId, Ejercicio: ejercicio, Fecha: fechaAsiento,
                Usuario: "admin", Apuntes: apuntesValidos,
                ...(asientoIdToEdit ? { IdAsiento: asientoIdToEdit } : {})
            }
        };

        const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
            body: JSON.stringify({ query: mutation, variables })
        });

        const data = await res.json();
        if (data.errors) throw new Error(data.errors[0].message);

        if (onSaved) onSaved();
        if (!asientoIdToEdit) setRowData([{ ...defaultRow }]);
        toast.success("Asiento grabado correctamente.");
    } catch (error: any) {
        toast.error(error.message || "Error al grabar el asiento");
    } finally {
        setLoading(false);
    }
  };

  const onDropFiles = useCallback(async (acceptedFiles: File[]) => {
      if (!asientoIdToEdit) {
          toast.error("Guarda el asiento primero para poder adjuntar documentos.");
          return;
      }

      setSubiendoDoc(true);
      const session: any = await getSession();

      for (const file of acceptedFiles) {
          try {
              // 1. Pedir URL Prefirmada
              const resUrl = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
                  body: JSON.stringify({
                      query: GENERAR_URL_SUBIDA_MUTATION,
                      variables: {
                          TenantId: tenantId,
                          Ejercicio: ejercicio,
                          IdAsiento: asientoIdToEdit,
                          NombreArchivo: file.name
                      }
                  })
              });
              
              const jsonUrl = await resUrl.json();
              if (jsonUrl.errors) throw new Error(jsonUrl.errors[0].message);
              
              const { Url } = jsonUrl.data.generarUrlSubida;

              // 2. Subir directamente a S3
              const uploadRes = await fetch(Url, {
                  method: 'PUT',
                  body: file,
                  headers: {
                      'Content-Type': file.type || 'application/pdf'
                  }
              });

              if (!uploadRes.ok) throw new Error("Error al subir el archivo a S3");

              toast.success(`Documento subido: ${file.name}`);
              
          } catch (err: any) {
              console.error("Error upload:", err);
              toast.error(err.message || "Error al subir documento");
          }
      }
      
      setSubiendoDoc(false);
      cargarAsientoDocs(); // Refrescar lista
  }, [asientoIdToEdit, tenantId, ejercicio, cargarAsientoDocs]);

  const descargarDocumento = async (s3Key: string) => {
      try {
          const session: any = await getSession();
          const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
              body: JSON.stringify({
                  query: OBTENER_URL_DESCARGA_QUERY,
                  variables: { S3Key: s3Key }
              })
          });
          
          const json = await res.json();
          if (json.errors) throw new Error(json.errors[0].message);
          
          const url = json.data.obtenerUrlDescarga;
          window.open(url, '_blank');
      } catch (err: any) {
          toast.error("Error al descargar documento");
      }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
      onDrop: onDropFiles,
      accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] }
  });

  const onGridReady = (params: GridReadyEvent) => { params.api.sizeColumnsToFit(); };
  const onCellValueChanged = (event: any) => {
    const lastRowIndex = gridRef.current!.api.getDisplayedRowCount() - 1;
    if (event.rowIndex === lastRowIndex && (event.data.Debe || event.data.Haber)) {
      setRowData(prev => [...prev, { ...defaultRow, Linea: String(prev.length + 1) }]);
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Barra superior de Plantillas y Acciones */}
      <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex gap-2 items-center">
            <span className="text-sm font-medium text-gray-600">Plantillas:</span>
            <select 
                className="border p-2 rounded text-sm bg-white"
                value={plantillaSeleccionada}
                onChange={(e) => {
                    setPlantillaSeleccionada(e.target.value);
                    if (e.target.value) setModalCargarPlantilla(true);
                }}
            >
                <option value="">Seleccionar predefinido...</option>
                {plantillas.map(p => (
                    <option key={p.TemplateId} value={p.TemplateId}>{p.NombrePlantilla}</option>
                ))}
            </select>
        </div>

        <div className="flex gap-3 items-center">
            {asientoIdToEdit && (
                <div className="flex items-center gap-2 mr-4">
                    <label className="text-sm font-semibold text-gray-600">Fecha del Asiento:</label>
                    <input type="date" value={fechaAsiento} onChange={(e) => setFechaAsiento(e.target.value)} className="border rounded p-1 text-sm"/>
                </div>
            )}

            <button onClick={() => setModalGuardarPlantilla(true)} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md transition-colors text-sm font-medium">
                💾 Guardar como Plantilla
            </button>
            <button onClick={handleSave} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors shadow-sm text-sm font-medium">
                {loading ? 'Procesando...' : (asientoIdToEdit ? 'Actualizar Asiento' : 'Grabar Asiento (Ctrl+S)')}
            </button>
        </div>
      </div>

      <div className="flex gap-4 w-full h-[400px]">
        {/* Panel del Grid (Izquierda) */}
        <div className={`h-full ${asientoIdToEdit ? 'w-3/4' : 'w-full'}`}>
            <AgGridReact
                ref={gridRef}
                theme={themeAlpine}
                rowData={rowData}
                columnDefs={colDefs}
                onGridReady={onGridReady}
                onCellKeyDown={handleCellKeyDown}
                onCellValueChanged={onCellValueChanged}
                singleClickEdit={true}
                enterNavigatesVertically={true}
                enterNavigatesVerticallyAfterEdit={true}
            />
            <p className="text-sm text-gray-500 mt-2">
                💡 <strong>Atajos:</strong> Usa <kbd className="bg-gray-100 p-1 rounded">Tab</kbd> o <kbd className="bg-gray-100 p-1 rounded">Enter</kbd> para moverte. 
                Pulsa <kbd className="bg-gray-100 p-1 rounded">+</kbd> en Debe/Haber para cuadrar automático.
            </p>
        </div>

        {/* Panel de Documentos (Derecha) - Solo visible en edición */}
        {asientoIdToEdit && (
            <div className="w-1/4 h-full flex flex-col bg-gray-50 border rounded-lg p-4 shadow-inner overflow-hidden">
                <h3 className="text-sm font-bold text-gray-800 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                    Archivo Documental
                </h3>
                
                {/* Zona Dropzone */}
                <div 
                    {...getRootProps()} 
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-4 ${
                        isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'
                    }`}
                >
                    <input {...getInputProps()} />
                    {subiendoDoc ? (
                        <p className="text-sm text-blue-600 font-medium animate-pulse">Subiendo...</p>
                    ) : isDragActive ? (
                        <p className="text-sm text-blue-600">Suelta los archivos aquí...</p>
                    ) : (
                        <div>
                            <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                            <p className="text-xs text-gray-500">Arrastra PDFs aquí, o haz clic para subir</p>
                        </div>
                    )}
                </div>

                {/* Lista de Documentos */}
                <div className="flex-1 overflow-y-auto">
                    {documentos.length === 0 && !subiendoDoc && (
                        <p className="text-xs text-gray-400 text-center italic mt-4">No hay documentos adjuntos en este asiento.</p>
                    )}
                    <ul className="space-y-2">
                        {documentos.map((doc, idx) => (
                            <li key={idx} className="bg-white p-3 rounded border shadow-sm flex items-center justify-between group hover:border-blue-300 transition-colors">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                                    <span className="text-xs font-medium text-gray-700 truncate" title={doc.Nombre}>{doc.Nombre}</span>
                                </div>
                                <button 
                                    onClick={() => descargarDocumento(doc.S3Key)}
                                    className="text-gray-400 hover:text-blue-600 flex-shrink-0 p-1 bg-gray-50 hover:bg-blue-50 rounded transition-colors"
                                    title="Descargar / Ver"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        )}
      </div>

      {/* MODALES OMITIDOS PARA BREVEDAD (están abajo) */}
      {/* MODAL GUARDAR PLANTILLA */}
      {modalGuardarPlantilla && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6">
              <div className="bg-white p-6 rounded-xl shadow-xl max-w-md w-full">
                  <h3 className="text-xl font-bold mb-4">Guardar Plantilla</h3>
                  <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Plantilla:</label>
                      <input type="text" className="w-full border rounded p-2" value={nombreNuevaPlantilla} onChange={e => setNombreNuevaPlantilla(e.target.value)} placeholder="Ej. Factura de Teléfono"/>
                  </div>
                  <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Selecciona la línea de la Base Imponible (100%):</label>
                      <p className="text-xs text-gray-500 mb-2">Las demás líneas se calcularán como un porcentaje de esta línea.</p>
                      <select className="w-full border rounded p-2 text-sm" value={lineaBaseIndex} onChange={e => setLineaBaseIndex(Number(e.target.value))}>
                          {gridRef.current?.api.getModel().forEachNode((node, idx) => {
                              const d = node.data as ApunteRow;
                              if (d.SubcuentaId && (d.Debe || d.Haber)) {
                                  // @ts-ignore
                                  const optionHtml = <option key={idx} value={idx}>Línea {d.Linea} - {d.SubcuentaId} - {(d.Debe||0) + (d.Haber||0)}€</option>;
                                  return optionHtml;
                              }
                          })}
                          {/* Hack manual para el renderizado del select */}
                          {rowData.map((row, idx) => {
                              if (row.SubcuentaId && (row.Debe || row.Haber)) {
                                  return <option key={idx} value={idx}>Línea {row.Linea} - Cuenta {row.SubcuentaId} - {row.Concepto} ({(row.Debe || 0) + (row.Haber || 0)}€)</option>
                              }
                              return null;
                          })}
                      </select>
                  </div>
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setModalGuardarPlantilla(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded">Cancelar</button>
                      <button onClick={handleGuardarComoPlantilla} className="px-4 py-2 text-white bg-blue-600 rounded">Guardar Plantilla</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL CARGAR PLANTILLA */}
      {modalCargarPlantilla && plantillaSeleccionada && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6">
              <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full">
                  <h3 className="text-xl font-bold mb-4">Cargar Plantilla</h3>
                  <p className="text-sm text-gray-600 mb-4">Introduce el importe base (100%) para la plantilla seleccionada. El resto de líneas se autocompletarán.</p>
                  <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Importe Base (€):</label>
                      <input 
                          type="number" 
                          step="0.01"
                          autoFocus
                          className="w-full border rounded p-2 text-xl font-bold" 
                          value={importeBase || ''} 
                          onChange={e => setImporteBase(Number(e.target.value))}
                          onKeyDown={e => { if (e.key === 'Enter') procesarCargaPlantilla(); }}
                      />
                  </div>
                  <div className="flex justify-end gap-2">
                      <button onClick={() => { setModalCargarPlantilla(false); setPlantillaSeleccionada(''); }} className="px-4 py-2 text-gray-600 bg-gray-100 rounded">Cancelar</button>
                      <button onClick={procesarCargaPlantilla} className="px-4 py-2 text-white bg-green-600 rounded">Aplicar y Cuadrar</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
