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
      UploadUrl: Url
      FileKey: S3Key
    }
  }
`;

const OBTENER_URL_DESCARGA_QUERY = `
  query ObtenerUrlDescarga($S3Key: String!) {
    obtenerUrlDescarga(S3Key: $S3Key)
  }
`;

const EXTRAER_OCR_MUTATION = `
  mutation ExtraerOcrFactura($S3Key: String!) {
    extraerOcrFactura(S3Key: $S3Key) {
      NIF
      Base
      Total
      TextoCompleto
    }
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
  Iva?: number | null;
  Debe: number | null;
  Haber: number | null;
  DistribucionAnalitica?: { CodigoProyecto: string; Porcentaje: number }[];
}

const defaultRow: ApunteRow = { Linea: '1', SubcuentaId: '', Concepto: '', Documento: '', Iva: null, Debe: null, Haber: null };

interface AsientoGridProps {
  asientoIdToEdit?: string;
  apuntesToEdit?: any[];
  onSaved?: () => void;
}

const AnaliticaCellRenderer = (props: any) => {
    const isGastoOrIngreso = props.data.SubcuentaId?.startsWith('6') || props.data.SubcuentaId?.startsWith('7');
    if (!isGastoOrIngreso) return null;
    const count = props.value?.length || 0;
    return (
      <button 
        onClick={() => props.context.openAnaliticaModal(props.node.rowIndex)} 
        className={`px-2 py-0.5 mt-1 rounded text-xs font-bold transition-all ${count > 0 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        title="Distribuir Costes"
      >
        📊 {count > 0 ? `(${count})` : ''}
      </button>
    );
};

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

  // Documentos y OCR
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [subiendoDoc, setSubiendoDoc] = useState(false);
  const [ocrLoading, setOcrLoading] = useState<string | null>(null);

  // Analítica Modal
  const [modalAnalitica, setModalAnalitica] = useState(false);
  const [analiticaIndex, setAnaliticaIndex] = useState<number>(-1);
  const [proyectosTemp, setProyectosTemp] = useState<{ CodigoProyecto: string; Porcentaje: number }[]>([]);

  const openAnaliticaModal = (rowIndex: number) => {
      const node = gridRef.current?.api.getDisplayedRowAtIndex(rowIndex);
      if (node) {
          setAnaliticaIndex(rowIndex);
          setProyectosTemp(node.data.DistribucionAnalitica || []);
          setModalAnalitica(true);
      }
  };

  const guardarAnalitica = () => {
      const total = proyectosTemp.reduce((acc, p) => acc + (Number(p.Porcentaje) || 0), 0);
      if (proyectosTemp.length > 0 && Math.abs(total - 100) > 0.01) {
          return toast.error("La suma de porcentajes debe ser exactamente 100%.");
      }
      
      const node = gridRef.current?.api.getDisplayedRowAtIndex(analiticaIndex);
      if (node) {
          node.setDataValue('DistribucionAnalitica', proyectosTemp.length > 0 ? proyectosTemp : undefined);
      }
      setModalAnalitica(false);
  };

  const fetchGraphQL = async (query: string, variables: any) => {
      const session: any = await getSession();
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': session?.accessToken || '' },
          cache: 'no-store',
          body: JSON.stringify({ query, variables })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      return json.data;
  };

  const cargarPlantillas = useCallback(async () => {
      if (!tenantId) return;
      try {
          const data = await fetchGraphQL(LISTAR_PLANTILLAS_QUERY, { TenantId: tenantId });
          if (data?.listarPlantillas) setPlantillas(data.listarPlantillas);
      } catch (err) {
          console.error("Error al cargar plantillas:", err);
      }
  }, [tenantId]);

  const cargarAsientoDocs = useCallback(async () => {
      if (!asientoIdToEdit) return;
      try {
          const data = await fetchGraphQL(OBTENER_ASIENTO_QUERY, { TenantId: tenantId, Ejercicio: ejercicio, IdAsiento: asientoIdToEdit });
          if (data?.obtenerAsiento?.Documentos) setDocumentos(data.obtenerAsiento.Documentos);
      } catch (err) {
          console.error("Error al cargar documentos del asiento:", err);
      }
  }, [tenantId, ejercicio, asientoIdToEdit]);

  useEffect(() => { cargarPlantillas(); }, [cargarPlantillas]);

  // Cargar datos si estamos en modo edición
  useEffect(() => {
      if (asientoIdToEdit && apuntesToEdit && apuntesToEdit.length > 0) {
          const loadedRows = apuntesToEdit.map(a => ({
              Linea: a.Linea,
              SubcuentaId: a.SubcuentaId,
              Concepto: a.Concepto,
              Documento: a.Documento || '',
              Iva: null,
              Debe: a.Debe || null,
              Haber: a.Haber || null,
              DistribucionAnalitica: a.DistribucionAnalitica || undefined
          }));
          setRowData([...loadedRows, { ...defaultRow, Linea: String(loadedRows.length + 1) }]);
          setFechaAsiento(apuntesToEdit[0].Fecha);
          cargarAsientoDocs();
      }
  }, [asientoIdToEdit, apuntesToEdit, cargarAsientoDocs]);

  const [colDefs] = useState<ColDef[]>([
    { field: 'SubcuentaId', headerName: 'Subcuenta', editable: true, flex: 1, cellEditor: SubcuentaCellEditor },
    { field: 'Concepto', headerName: 'Concepto', editable: true, flex: 2 },
    { field: 'DistribucionAnalitica', headerName: 'Analítica', width: 90, cellRenderer: AnaliticaCellRenderer, editable: false },
    { 
      field: 'Iva', 
      headerName: '% IVA', 
      editable: true, 
      width: 90, 
      cellEditor: 'agSelectCellEditor', 
      cellEditorParams: { values: [0, 4, 10, 21] },
      valueParser: (params) => params.newValue ? Number(params.newValue) : null
    },
    { field: 'Debe', headerName: 'Debe', editable: true, type: 'numericColumn', flex: 1, valueParser: (params) => Number(params.newValue) || null },
    { field: 'Haber', headerName: 'Haber', editable: true, type: 'numericColumn', flex: 1, valueParser: (params) => Number(params.newValue) || null },
  ]);

  const handleCellKeyDown = useCallback((e: CellKeyDownEvent) => {
    const keyboardEvent = e.event as KeyboardEvent;
    if (keyboardEvent.key === '+') {
      const field = e.colDef.field;
      if (field === 'SubcuentaId') {
          keyboardEvent.preventDefault();
          gridRef.current!.api.startEditingCell({ rowIndex: e.rowIndex!, colKey: 'SubcuentaId' });
      } else if (field === 'Concepto') {
          keyboardEvent.preventDefault();
          if (e.rowIndex !== null && e.rowIndex > 0) {
              const prevNode = gridRef.current!.api.getDisplayedRowAtIndex(e.rowIndex - 1);
              if (prevNode && prevNode.data.Concepto) {
                  const node = gridRef.current!.api.getRowNode(e.node.id!);
                  if (node) {
                      node.setDataValue('Concepto', prevNode.data.Concepto);
                      gridRef.current!.api.stopEditing();
                  }
              }
          }
      } else if (field === 'Debe' || field === 'Haber') {
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
                DistribucionAnalitica: d.DistribucionAnalitica
            });
            totalDebe += Number(d.Debe) || 0;
            totalHaber += Number(d.Haber) || 0;
        }
    });

    if (apuntesValidos.length === 0) return toast.error("El asiento está vacío.");
    if (Math.abs(totalDebe - totalHaber) > 0.01) return toast.error(`Asiento descuadrado. Diferencia: ${Math.abs(totalDebe - totalHaber).toFixed(2)}`);

    try {
        setLoading(true);
        const mutation = asientoIdToEdit ? EDITAR_ASIENTO_MUTATION : CREAR_ASIENTO_MUTATION;
        const variables = {
            input: {
                TenantId: tenantId, Ejercicio: ejercicio, Fecha: fechaAsiento,
                Usuario: "admin", Apuntes: apuntesValidos,
                ...(asientoIdToEdit ? { IdAsiento: asientoIdToEdit } : {})
            }
        };

        await fetchGraphQL(mutation, variables);

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
      for (const file of acceptedFiles) {
          try {
              const dataUrl = await fetchGraphQL(GENERAR_URL_SUBIDA_MUTATION, {
                  TenantId: tenantId, Ejercicio: ejercicio, IdAsiento: asientoIdToEdit, NombreArchivo: file.name
              });
              
              const { UploadUrl } = dataUrl.generarUrlSubida;
              const uploadRes = await fetch(UploadUrl, {
                  method: 'PUT',
                  body: file,
                  headers: { 'Content-Type': file.type || 'application/pdf' }
              });

              if (!uploadRes.ok) throw new Error("Error al subir el archivo a S3");
              toast.success(`Documento subido: ${file.name}`);
          } catch (err: any) {
              console.error("Error upload:", err);
              toast.error(err.message || "Error al subir documento");
          }
      }
      setSubiendoDoc(false);
      cargarAsientoDocs(); 
  }, [asientoIdToEdit, tenantId, ejercicio, cargarAsientoDocs]);

  const descargarDocumento = async (s3Key: string) => {
      try {
          const data = await fetchGraphQL(OBTENER_URL_DESCARGA_QUERY, { S3Key: s3Key });
          const a = document.createElement('a');
          a.href = data.obtenerUrlDescarga;
          a.download = s3Key.split('/').pop() || 'documento';
          document.body.appendChild(a);
          a.click();
          a.remove();
      } catch (err: any) {
          toast.error("Error al descargar documento");
      }
  };

  const extraerDatosOcr = async (s3Key: string) => {
      setOcrLoading(s3Key);
      const toastId = toast.loading("Extrayendo datos de la factura con IA...");
      try {
          const data = await fetchGraphQL(EXTRAER_OCR_MUTATION, { S3Key: s3Key });
          const { NIF, Base, Total } = data.extraerOcrFactura;
          
          if (Base) {
             setRowData(prev => {
                let newData = [...prev];
                // Comportamiento no destructivo con excepción
                if (newData.length === 1 && !newData[0].SubcuentaId && !newData[0].Debe && !newData[0].Haber) {
                    newData[0] = { ...newData[0], SubcuentaId: '6000000', Concepto: NIF ? `Factura NIF: ${NIF}` : 'Gastos OCR', Debe: Base };
                } else {
                    newData.push({ ...defaultRow, Linea: String(newData.length + 1), SubcuentaId: '6000000', Concepto: NIF ? `Factura NIF: ${NIF}` : 'Gastos OCR', Debe: Base });
                }
                newData.push({ ...defaultRow, Linea: String(newData.length + 1) });
                return newData;
             });
             toast.success(`¡OCR Completado! Base: ${Base}€`, { id: toastId });
          } else {
             toast.error("El OCR no encontró importes válidos.", { id: toastId });
          }
      } catch (err: any) {
          console.error("OCR Error:", err);
          toast.error(`Error en OCR: ${err.message}`, { id: toastId });
      } finally {
          setOcrLoading(null);
      }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
      onDrop: onDropFiles,
      accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] }
  });

  const onGridReady = (params: GridReadyEvent) => { params.api.sizeColumnsToFit(); };
  
  const onCellValueChanged = (event: any) => {
    const d = event.data as ApunteRow;
    const field = event.colDef.field;

    // Lógica para autogenerar IVA
    if ((field === 'Iva' || field === 'Debe' || field === 'Haber' || field === 'SubcuentaId') && d.Iva != null && d.SubcuentaId && (d.Debe || d.Haber)) {
        const isCliente = d.SubcuentaId.startsWith('43') || d.SubcuentaId.startsWith('44');
        const isProveedor = d.SubcuentaId.startsWith('40') || d.SubcuentaId.startsWith('41');
        
        let newLines: ApunteRow[] = [];
        
        if (isCliente && d.Debe && d.Debe > 0) {
             const base = d.Debe / (1 + d.Iva / 100);
             const cuota = d.Debe - base;
             newLines.push({ ...defaultRow, SubcuentaId: '7000000', Concepto: 'Base Imponible', Haber: Number(base.toFixed(2)) });
             newLines.push({ ...defaultRow, SubcuentaId: `47700${d.Iva}`, Concepto: `IVA Repercutido ${d.Iva}%`, Haber: Number(cuota.toFixed(2)) });
        } else if (isProveedor && d.Haber && d.Haber > 0) {
             const base = d.Haber / (1 + d.Iva / 100);
             const cuota = d.Haber - base;
             newLines.push({ ...defaultRow, SubcuentaId: '6000000', Concepto: 'Base Imponible', Debe: Number(base.toFixed(2)) });
             newLines.push({ ...defaultRow, SubcuentaId: `47200${d.Iva}`, Concepto: `IVA Soportado ${d.Iva}%`, Debe: Number(cuota.toFixed(2)) });
        } else if (d.Haber && d.Haber > 0 && !isProveedor) {
             const cuota = d.Haber * (d.Iva / 100);
             newLines.push({ ...defaultRow, SubcuentaId: `47700${d.Iva}`, Concepto: `IVA Repercutido ${d.Iva}%`, Haber: Number(cuota.toFixed(2)) });
        } else if (d.Debe && d.Debe > 0 && !isCliente) {
             const cuota = d.Debe * (d.Iva / 100);
             newLines.push({ ...defaultRow, SubcuentaId: `47200${d.Iva}`, Concepto: `IVA Soportado ${d.Iva}%`, Debe: Number(cuota.toFixed(2)) });
        }

        if (newLines.length > 0) {
             setTimeout(() => {
                 setRowData(prev => {
                     const newData = [...prev];
                     const currIdx = newData.findIndex(r => r.Linea === d.Linea);
                     if (currIdx > -1) newData[currIdx].Iva = null;

                     newLines.forEach(nl => {
                         nl.Linea = String(newData.length + 1);
                         newData.push(nl);
                     });
                     
                     if (newData[newData.length - 1].Debe || newData[newData.length - 1].Haber) {
                         newData.push({ ...defaultRow, Linea: String(newData.length + 1) });
                     }
                     
                     return newData;
                 });
             }, 100);
             return;
        }
    }

    const lastRowIndex = gridRef.current!.api.getDisplayedRowCount() - 1;
    if (event.rowIndex === lastRowIndex && (event.data.Debe || event.data.Haber)) {
      setRowData(prev => [...prev, { ...defaultRow, Linea: String(prev.length + 1) }]);
    }
  };

  const procesarCargaPlantilla = () => { /* implementacion mockada/recortada */ setModalCargarPlantilla(false); };
  const handleGuardarComoPlantilla = () => { /* implementacion mockada/recortada */ setModalGuardarPlantilla(false); };

  return (
    <div className="w-full flex flex-col gap-4" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); handleSave(); } }}>
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex gap-3 items-center">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Plantillas:</span>
            <select 
                className="border border-slate-300 dark:border-slate-600 p-2.5 rounded-lg text-sm bg-white dark:bg-slate-900 font-semibold text-slate-800 dark:text-slate-200 outline-none"
                value={plantillaSeleccionada}
                onChange={(e) => {
                    setPlantillaSeleccionada(e.target.value);
                    if (e.target.value) setModalCargarPlantilla(true);
                }}
            >
                <option value="">Seleccionar predefinido...</option>
                {plantillas.map(p => <option key={p.TemplateId} value={p.TemplateId}>{p.NombrePlantilla}</option>)}
            </select>
        </div>

        <div className="flex gap-4 items-center">
            {asientoIdToEdit && (
                <div className="flex items-center gap-2 mr-4">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Fecha:</label>
                    <input type="date" value={fechaAsiento} onChange={(e) => setFechaAsiento(e.target.value)} className="border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm font-bold text-slate-800 dark:text-slate-200 outline-none"/>
                </div>
            )}
            <button onClick={() => setModalGuardarPlantilla(true)} className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-700 hover:border-indigo-200 hover:bg-indigo-50 px-4 py-2.5 rounded-lg transition-all text-sm font-bold shadow-sm">
                💾 Guardar como Plantilla
            </button>
            <button onClick={handleSave} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg transition-all shadow-md text-sm font-bold tracking-wide">
                {loading ? 'Procesando...' : (asientoIdToEdit ? 'Actualizar Asiento' : 'Grabar Asiento (Ctrl+S)')}
            </button>
        </div>
      </div>

      <div className="flex gap-4 w-full h-[400px]">
        {/* Panel del Grid (Izquierda) */}
        <div className={`h-full shadow-sm border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden ${asientoIdToEdit ? 'w-3/4' : 'w-full'}`}>
            <AgGridReact
                ref={gridRef}
                theme={themeAlpine}
                rowData={rowData}
                columnDefs={colDefs}
                onGridReady={onGridReady}
                onCellKeyDown={handleCellKeyDown}
                onCellValueChanged={onCellValueChanged}
                singleClickEdit={true}
                context={{ openAnaliticaModal }}
                enterNavigatesVertically={true}
                enterNavigatesVerticallyAfterEdit={true}
            />
        </div>
        
        {/* Panel de Documentos (Derecha) */}
        {asientoIdToEdit && (
            <div className="w-1/4 h-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm overflow-hidden">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                    Archivo Documental
                </h3>
                
                <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-5 ${isDragActive ? 'border-indigo-500 bg-indigo-50 scale-105' : 'border-slate-300 hover:border-indigo-400 bg-white'}`}>
                    <input {...getInputProps()} />
                    {subiendoDoc ? (
                        <p className="text-sm text-indigo-600 font-bold animate-pulse">Subiendo...</p>
                    ) : isDragActive ? (
                        <p className="text-sm text-indigo-600 font-bold">Suelta los archivos aquí...</p>
                    ) : (
                        <div>
                            <svg className="mx-auto h-10 w-10 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                            <p className="text-xs font-medium text-slate-500">Arrastra PDFs aquí, o haz clic para subir</p>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto pr-1">
                    {documentos.length === 0 && !subiendoDoc && <p className="text-xs text-slate-400 text-center font-medium mt-4">No hay documentos adjuntos en este asiento.</p>}
                    <ul className="space-y-2">
                        {documentos.map((doc, idx) => (
                            <li key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-lg shadow-sm flex flex-col gap-2">
                                <div className="flex items-center justify-between group cursor-pointer hover:text-indigo-700" onClick={() => descargarDocumento(doc.S3Key)}>
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                                        <span className="text-xs font-bold text-slate-700 truncate" title={doc.Nombre}>{doc.Nombre}</span>
                                    </div>
                                    <button className="text-slate-400 hover:text-indigo-600 p-1" title="Descargar / Ver">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                    </button>
                                </div>
                                
                                {/* Botón Inteligencia Artificial OCR */}
                                <button 
                                    disabled={ocrLoading === doc.S3Key}
                                    onClick={(e) => { e.stopPropagation(); extraerDatosOcr(doc.S3Key); }}
                                    className="w-full text-xs font-bold flex items-center justify-center gap-1.5 py-1.5 border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md transition-colors disabled:opacity-50"
                                >
                                    {ocrLoading === doc.S3Key ? 'Analizando...' : (
                                        <>✨ Extraer con IA (OCR)</>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        )}
      </div>

      {/* MODAL ANALÍTICA */}
      {modalAnalitica && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl max-w-sm w-full border border-slate-100">
                <h3 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2">📊 Distribución Analítica</h3>
                <p className="text-xs text-slate-500 mb-4">Asigna el % de este apunte a diferentes Centros de Coste (Proyectos).</p>
                
                <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
                    {proyectosTemp.map((p, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <input 
                                type="text" placeholder="Proyecto" 
                                className="w-2/3 border border-slate-300 rounded p-2 text-sm font-bold uppercase"
                                value={p.CodigoProyecto}
                                onChange={e => {
                                    const copy = [...proyectosTemp];
                                    copy[idx].CodigoProyecto = e.target.value.toUpperCase();
                                    setProyectosTemp(copy);
                                }}
                            />
                            <div className="w-1/3 flex items-center gap-1">
                                <input 
                                    type="number" min="0" max="100" 
                                    className="w-full border border-slate-300 rounded p-2 text-sm text-right"
                                    value={p.Porcentaje}
                                    onChange={e => {
                                        const copy = [...proyectosTemp];
                                        copy[idx].Porcentaje = Number(e.target.value);
                                        setProyectosTemp(copy);
                                    }}
                                />
                                <span className="font-bold text-slate-400">%</span>
                            </div>
                            <button onClick={() => setProyectosTemp(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">✖</button>
                        </div>
                    ))}
                </div>
                
                <button 
                    onClick={() => setProyectosTemp([...proyectosTemp, { CodigoProyecto: '', Porcentaje: 0 }])}
                    className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 p-2 rounded hover:bg-indigo-100 mb-6"
                >+ Añadir Centro de Coste</button>

                <div className="flex justify-between items-center border-t border-slate-100 pt-4">
                    <span className="text-sm font-bold text-slate-600">Total: {proyectosTemp.reduce((acc, p) => acc + (Number(p.Porcentaje)||0), 0)}%</span>
                    <div className="flex gap-2">
                        <button onClick={() => setModalAnalitica(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                        <button onClick={guardarAnalitica} className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow">Guardar</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
