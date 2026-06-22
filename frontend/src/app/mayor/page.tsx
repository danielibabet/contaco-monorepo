'use client';

import React, { useState, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry, themeAlpine } from 'ag-grid-community';
import { getSession } from 'next-auth/react';
import { useTenant } from '@/context/TenantContext';
import SubcuentaSelector from '@/components/SubcuentaSelector';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
      }
    }
  }
`;

export default function LibroMayorPage() {
  const { tenantId, ejercicio } = useTenant();
  const [mayorData, setMayorData] = useState<MayorResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gridRef = useRef<AgGridReact>(null);

  const [colDefs] = useState<ColDef[]>([
    { field: 'Fecha', headerName: 'Fecha', width: 120, sortable: true },
    { field: 'IdAsiento', headerName: 'Asiento', width: 100 },
    { field: 'Documento', headerName: 'Documento', width: 130 },
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

    // Título
    doc.setFontSize(18);
    doc.text('LIBRO MAYOR', 14, 22);

    // Detalles
    doc.setFontSize(11);
    doc.text(`Empresa / Tenant: ${tenantId}`, 14, 32);
    doc.text(`Ejercicio: ${ejercicio}`, 14, 38);
    doc.text(`Subcuenta: ${mayorData.SubcuentaId}`, 14, 44);
    doc.text(`Fecha de impresión: ${currentDate}`, 14, 50);

    // Tabla
    const tableData = mayorData.Apuntes.map(apunte => [
      apunte.Fecha,
      apunte.IdAsiento,
      apunte.Concepto,
      apunte.Debe ? Number(apunte.Debe).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '',
      apunte.Haber ? Number(apunte.Haber).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '',
      Number(apunte.Saldo).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['Fecha', 'Asiento', 'Concepto', 'Debe', 'Haber', 'Saldo']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 9 },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' }
      }
    });

    // Saldo Final
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
          <h1 className="text-3xl font-bold text-gray-800">Libro Mayor</h1>
          <p className="text-gray-500 mt-1">Extracto de movimientos y saldo acumulado</p>
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
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-4 z-10">
        <div className="flex-1 w-full flex flex-col">
          <label className="text-sm font-semibold text-gray-700 mb-2">Selecciona la Subcuenta:</label>
          <SubcuentaSelector 
            onSelect={handleSubcuentaSelect} 
            autoFocus 
            className="w-full max-w-lg" 
            menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
          />
        </div>
        {mayorData && (
          <div className="flex flex-col items-end bg-gray-50 p-4 rounded-lg border min-w-[200px]">
             <span className="text-sm text-gray-500 font-medium">Saldo Final</span>
             <span className={`text-2xl font-bold ${mayorData.SaldoFinal < 0 ? 'text-red-600' : 'text-gray-900'}`}>
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
      <div className="flex-1 w-full h-full bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">Cargando libro mayor...</div>
        ) : mayorData ? (
          <AgGridReact
            ref={gridRef}
            rowData={mayorData.Apuntes}
            columnDefs={colDefs}
            theme={themeAlpine}
            animateRows={true}
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
