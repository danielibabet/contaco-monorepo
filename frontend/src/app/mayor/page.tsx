'use client';

import React, { useState, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellRendererParams } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry, themeAlpine } from 'ag-grid-community';
import { getSession } from 'next-auth/react';
import { useTenant } from '@/context/TenantContext';
import SubcuentaSelector from '@/components/SubcuentaSelector';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';

ModuleRegistry.registerModules([AllCommunityModule]);

interface MayorLinea {
  IdAsiento: string;
  Linea: string;
  Fecha: string;
  Concepto: string;
  Documento?: string;
  Debe: number;
  Haber: number;
  Saldo: number;
  Punteado?: boolean;
}

interface MayorResultado {
  SubcuentaId: string;
  SaldoFinal: number;
  Apuntes: MayorLinea[];
}

const OBTENER_MAYOR_QUERY = `
  query ObtenerMayor($TenantId: String!, $Ejercicio: String!, $SubcuentaId: String!) {
    obtenerMayor(TenantId: $TenantId, Ejercicio: $Ejercicio, SubcuentaId: $SubcuentaId) {
      SubcuentaId
      SaldoFinal
      Apuntes {
        IdAsiento
        Linea
        Fecha
        Concepto
        Documento
        Debe
        Haber
        Saldo
        Punteado
      }
    }
  }
`;

const ALTERNAR_PUNTEO_MUTATION = `
  mutation AlternarPunteo($TenantId: String!, $Ejercicio: String!, $IdAsiento: String!, $Linea: String!, $Estado: Boolean!) {
    alternarPunteo(TenantId: $TenantId, Ejercicio: $Ejercicio, IdAsiento: $IdAsiento, Linea: $Linea, Estado: $Estado)
  }
`;

export default function LibroMayorPage() {
  const { tenantId, ejercicio } = useTenant();
  const [mayorData, setMayorData] = useState<MayorResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocultarPunteados, setOcultarPunteados] = useState(false);

  const gridRef = useRef<AgGridReact>(null);

  const togglePunteo = async (data: MayorLinea, nuevoEstado: boolean) => {
    // Optimistic UI update en el rowData local
    if (!mayorData) return;
    const newData = { ...mayorData };
    const apunteIndex = newData.Apuntes.findIndex(a => a.IdAsiento === data.IdAsiento && a.Linea === data.Linea);
    if (apunteIndex > -1) {
      newData.Apuntes[apunteIndex].Punteado = nuevoEstado;
      setMayorData(newData);
      gridRef.current?.api.onFilterChanged();
    }

    try {
      const session: any = await getSession();
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.accessToken || ''
        },
        body: JSON.stringify({
          query: ALTERNAR_PUNTEO_MUTATION,
          variables: {
            TenantId: tenantId,
            Ejercicio: ejercicio,
            IdAsiento: data.IdAsiento,
            Linea: data.Linea,
            Estado: nuevoEstado
          }
        })
      });

      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
    } catch (err: any) {
      toast.error("Error al guardar el punteo");
      // Revertir
      const revertData = { ...mayorData };
      const apunteIdxRevert = revertData.Apuntes.findIndex(a => a.IdAsiento === data.IdAsiento && a.Linea === data.Linea);
      if (apunteIdxRevert > -1) {
        revertData.Apuntes[apunteIdxRevert].Punteado = !nuevoEstado;
        setMayorData(revertData);
        gridRef.current?.api.onFilterChanged();
      }
    }
  };

  const CheckboxRenderer = (params: ICellRendererParams) => {
    if (!params.data) return null;
    return (
      <div className="flex items-center justify-center h-full">
        <input 
          type="checkbox" 
          checked={params.data.Punteado || false}
          onChange={(e) => togglePunteo(params.data, e.target.checked)}
          className="w-5 h-5 cursor-pointer accent-blue-600 rounded"
        />
      </div>
    );
  };

  const [colDefs] = useState<ColDef[]>([
    { 
      field: 'Punteado', 
      headerName: '✔', 
      width: 60, 
      cellRenderer: CheckboxRenderer,
      sortable: false,
      filter: false
    },
    { field: 'Fecha', headerName: 'Fecha', width: 120, sortable: true },
    { field: 'IdAsiento', headerName: 'Asiento', width: 100 },
    { field: 'Concepto', headerName: 'Concepto', flex: 1, filter: true },
    { 
      field: 'Debe', 
      headerName: 'Debe', 
      width: 120,
      valueFormatter: (params) => params.value ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(params.value) : '' 
    },
    { 
      field: 'Haber', 
      headerName: 'Haber', 
      width: 120,
      valueFormatter: (params) => params.value ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(params.value) : '' 
    },
    { 
      field: 'Saldo', 
      headerName: 'Saldo', 
      width: 140,
      cellStyle: (params) => ({ fontWeight: 'bold', color: params.value < 0 ? '#ef4444' : '#1f2937' }),
      valueFormatter: (params) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(params.value)
    },
  ]);

  const isExternalFilterPresent = () => {
    return ocultarPunteados;
  };

  const doesExternalFilterPass = (node: any) => {
    if (ocultarPunteados) {
      return !node.data.Punteado;
    }
    return true;
  };

  useEffect(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.onFilterChanged();
    }
  }, [ocultarPunteados]);

  const loadMayor = async (subcuentaId: string) => {
    setLoading(true);
    setError(null);
    setMayorData(null);

    try {
      const session: any = await getSession();
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.accessToken || ''
        },
        body: JSON.stringify({
          query: OBTENER_MAYOR_QUERY,
          variables: { 
            TenantId: tenantId, 
            Ejercicio: ejercicio, 
            SubcuentaId: subcuentaId 
          }
        })
      });

      const json = await res.json();
      if (json.errors) {
        throw new Error(json.errors[0].message);
      }

      setMayorData(json.data.obtenerMayor);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubcuentaSelect = (subcuenta: any) => {
    if (subcuenta) {
      loadMayor(subcuenta.CodSubcuenta);
    } else {
      setMayorData(null);
    }
  };

  const exportPDF = () => {
    if (!mayorData) return;

    const doc = new jsPDF();
    const currentDate = new Date().toLocaleDateString('es-ES');

    doc.setFontSize(18);
    doc.text('LIBRO MAYOR', 14, 22);

    doc.setFontSize(11);
    doc.text(`Empresa / Tenant: ${tenantId}`, 14, 32);
    doc.text(`Ejercicio: ${ejercicio}`, 14, 38);
    doc.text(`Subcuenta: ${mayorData.SubcuentaId}`, 14, 44);
    doc.text(`Fecha de impresión: ${currentDate}`, 14, 50);

    const tableData = mayorData.Apuntes.map(apunte => [
      apunte.Fecha,
      apunte.IdAsiento,
      apunte.Concepto,
      apunte.Debe ? Number(apunte.Debe).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '',
      apunte.Haber ? Number(apunte.Haber).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '',
      Number(apunte.Saldo).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
      apunte.Punteado ? 'S' : 'N'
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['Fecha', 'Asiento', 'Concepto', 'Debe', 'Haber', 'Saldo', 'Punteado']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 9 },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'center' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 55;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Saldo Final: ${Number(mayorData.SaldoFinal).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`, 
      14, 
      finalY + 10
    );

    doc.save(`Mayor_${mayorData.SubcuentaId}_${ejercicio}.pdf`);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <header className="flex justify-between items-end border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Libro Mayor y Conciliación</h1>
          <p className="text-gray-500 mt-1">Extracto de movimientos, punteo y saldo acumulado</p>
        </div>
        {mayorData && (
          <button
            onClick={exportPDF}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition-colors shadow-sm font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
            Exportar a PDF
          </button>
        )}
      </header>

      {/* Panel de Filtro */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row items-center gap-4 z-10">
        <div className="flex-1 w-full flex flex-col">
          <label className="text-sm font-semibold text-gray-700 mb-2">Selecciona la Subcuenta (ej. Banco 572):</label>
          <SubcuentaSelector 
            onSelect={handleSubcuentaSelect} 
            autoFocus 
            className="w-full max-w-lg" 
            menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
          />
        </div>

        {mayorData && (
            <div className="flex items-center gap-2 bg-blue-50 text-blue-800 px-4 py-3 rounded-lg border border-blue-200">
                <input 
                    type="checkbox" 
                    id="ocultarPunteados" 
                    className="w-5 h-5 cursor-pointer accent-blue-600"
                    checked={ocultarPunteados}
                    onChange={(e) => setOcultarPunteados(e.target.checked)}
                />
                <label htmlFor="ocultarPunteados" className="font-medium cursor-pointer">
                    Ocultar movimientos punteados
                </label>
            </div>
        )}

        {mayorData && (
          <div className="flex flex-col items-end bg-gray-50 dark:bg-slate-800 p-4 rounded-lg border min-w-[200px]">
             <span className="text-sm text-gray-500 font-medium">Saldo Final</span>
             <span className={`text-2xl font-bold ${mayorData.SaldoFinal < 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(mayorData.SaldoFinal)}
             </span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 shadow-sm">
          <strong>Error: </strong> {error}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 w-full h-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">Cargando libro mayor...</div>
        ) : mayorData ? (
          <AgGridReact
            ref={gridRef}
            rowData={mayorData.Apuntes}
            columnDefs={colDefs}
            theme={themeAlpine}
            animateRows={true}
            isExternalFilterPresent={isExternalFilterPresent}
            doesExternalFilterPass={doesExternalFilterPass}
            defaultColDef={{
              resizable: true,
              sortable: true
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
               <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
               </svg>
               <p>Selecciona una subcuenta para ver sus movimientos</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
