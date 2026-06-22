'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ModuleRegistry, AllCommunityModule, themeAlpine } from 'ag-grid-community';
import toast from 'react-hot-toast';
import { getSession } from 'next-auth/react';
import { useTenant } from '@/context/TenantContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

ModuleRegistry.registerModules([AllCommunityModule]);

const OBTENER_BALANCE_QUERY = `
  query ObtenerBalanceSumasSaldos($TenantId: String!, $Ejercicio: String!) {
    obtenerBalanceSumasSaldos(TenantId: $TenantId, Ejercicio: $Ejercicio) {
      SubcuentaId
      Descripcion
      SumaDebe
      SumaHaber
      SaldoDeudor
      SaldoAcreedor
      Nivel
    }
  }
`;

export default function BalancesPage() {
  const { tenantId, ejercicio } = useTenant();
  const gridRef = useRef<AgGridReact>(null);
  const [rowData, setRowData] = useState<any[]>([]);
  const [allData, setAllData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [nivelFiltro, setNivelFiltro] = useState<string>('MAX');
  const [totales, setTotales] = useState<any[]>([{ SubcuentaId: 'TOTALES', Descripcion: '', SumaDebe: 0, SumaHaber: 0, SaldoDeudor: 0, SaldoAcreedor: 0 }]);
  const [descuadre, setDescuadre] = useState(false);

  const [colDefs] = useState<ColDef[]>([
    { field: 'SubcuentaId', headerName: 'Cuenta', flex: 1, filter: true },
    { field: 'Descripcion', headerName: 'Descripción', flex: 2, filter: true },
    { field: 'SumaDebe', headerName: 'Suma Debe', flex: 1, type: 'numericColumn', valueFormatter: p => p.value?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) },
    { field: 'SumaHaber', headerName: 'Suma Haber', flex: 1, type: 'numericColumn', valueFormatter: p => p.value?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) },
    { field: 'SaldoDeudor', headerName: 'Saldo Deudor', flex: 1, type: 'numericColumn', valueFormatter: p => p.value?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) },
    { field: 'SaldoAcreedor', headerName: 'Saldo Acreedor', flex: 1, type: 'numericColumn', valueFormatter: p => p.value?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) },
  ]);

  const cargarBalances = useCallback(async () => {
    setLoading(true);
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
          query: OBTENER_BALANCE_QUERY,
          variables: { 
            TenantId: tenantId, 
            Ejercicio: ejercicio
          }
        })
      });

      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);

      const balances = json.data.obtenerBalanceSumasSaldos;
      setAllData(balances);
      filtrarPorNivel(balances, nivelFiltro);
      
    } catch (error: any) {
      toast.error(error.message || "Error al cargar balances");
    } finally {
      setLoading(false);
    }
  }, [nivelFiltro]);

  const filtrarPorNivel = (datos: any[], nivel: string) => {
    const filtrados = datos.filter(d => d.Nivel === nivel);
    setRowData(filtrados);
    calcularTotales(filtrados);
  };

  const calcularTotales = (datos: any[]) => {
    let tDebe = 0;
    let tHaber = 0;
    let tDeudor = 0;
    let tAcreedor = 0;

    datos.forEach(d => {
      tDebe += d.SumaDebe;
      tHaber += d.SumaHaber;
      tDeudor += d.SaldoDeudor;
      tAcreedor += d.SaldoAcreedor;
    });

    // Pequeño redondeo para evitar errores de precisión flotante en JS
    tDebe = Math.round(tDebe * 100) / 100;
    tHaber = Math.round(tHaber * 100) / 100;

    setTotales([{
      SubcuentaId: 'TOTALES',
      Descripcion: '',
      SumaDebe: tDebe,
      SumaHaber: tHaber,
      SaldoDeudor: tDeudor,
      SaldoAcreedor: tAcreedor
    }]);

    setDescuadre(tDebe !== tHaber);
  };

  useEffect(() => {
    cargarBalances();
  }, [cargarBalances, tenantId, ejercicio]);

  const handleNivelChange = (nivel: string) => {
    setNivelFiltro(nivel);
    filtrarPorNivel(allData, nivel);
  };

  const exportarCsv = () => {
    gridRef.current?.api.exportDataAsCsv({ fileName: `Balance_Sumas_Saldos_Nivel_${nivelFiltro}.csv` });
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    const currentDate = new Date().toLocaleDateString('es-ES');

    doc.setFontSize(18);
    doc.text('BALANCE DE SUMAS Y SALDOS', 14, 22);

    doc.setFontSize(11);
    doc.text(`Empresa / Tenant: ${tenantId}`, 14, 32);
    doc.text(`Ejercicio: ${ejercicio}`, 14, 38);
    doc.text(`Nivel de Desglose: ${nivelFiltro}`, 14, 44);
    doc.text(`Fecha de impresión: ${currentDate}`, 14, 50);

    const tableData = rowData.map(d => [
      d.SubcuentaId,
      d.Descripcion,
      d.SumaDebe ? Number(d.SumaDebe).toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '0,00',
      d.SumaHaber ? Number(d.SumaHaber).toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '0,00',
      d.SaldoDeudor ? Number(d.SaldoDeudor).toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '0,00',
      d.SaldoAcreedor ? Number(d.SaldoAcreedor).toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '0,00'
    ]);

    // Añadir totales
    if (totales.length > 0) {
      const t = totales[0];
      tableData.push([
        t.SubcuentaId,
        t.Descripcion,
        Number(t.SumaDebe).toLocaleString('es-ES', { minimumFractionDigits: 2 }),
        Number(t.SumaHaber).toLocaleString('es-ES', { minimumFractionDigits: 2 }),
        Number(t.SaldoDeudor).toLocaleString('es-ES', { minimumFractionDigits: 2 }),
        Number(t.SaldoAcreedor).toLocaleString('es-ES', { minimumFractionDigits: 2 })
      ]);
    }

    autoTable(doc, {
      startY: 55,
      head: [['Cuenta', 'Descripción', 'Suma Debe', 'Suma Haber', 'Saldo Deudor', 'Saldo Acreedor']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 8 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' }
      },
      didParseCell: function(data) {
        // Pintar la última fila de totales en gris claro y negrita
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fillColor = [243, 244, 246];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    doc.save(`Balance_Sumas_Saldos_Nivel_${nivelFiltro}_${ejercicio}.pdf`);
  };

  // Clases CSS condicionales para la fila de totales (Pinned Bottom Row)
  const getRowStyle = (params: any) => {
    if (params.node.rowPinned) {
      return descuadre 
        ? { backgroundColor: '#ef4444', color: 'white', fontWeight: 'bold' } 
        : { backgroundColor: '#f3f4f6', fontWeight: 'bold' };
    }
    return undefined;
  };

  return (
    <div className="flex flex-col gap-6 h-[80vh]">
      <header className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Balance de Sumas y Saldos</h1>
          <p className="text-gray-500 mt-1">Comprueba la salud contable y el cuadre general del ejercicio.</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button onClick={() => handleNivelChange('3')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${nivelFiltro === '3' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>Nivel 3</button>
            <button onClick={() => handleNivelChange('4')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${nivelFiltro === '4' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>Nivel 4</button>
            <button onClick={() => handleNivelChange('MAX')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${nivelFiltro === 'MAX' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>Máximo Desglose</button>
          </div>
          <button onClick={exportarCsv} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium shadow transition-colors flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Exportar CSV
          </button>
          <button onClick={exportarPDF} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium shadow transition-colors flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
            Exportar a PDF
          </button>
        </div>
      </header>

      {descuadre && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-sm">
          <p className="font-bold">¡ALERTA DE DESCUADRE!</p>
          <p>El Total del Debe no coincide con el Total del Haber. Revisa los asientos del diario.</p>
        </div>
      )}

      <div className="flex-1 w-full relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : null}
        <AgGridReact
          ref={gridRef}
          theme={themeAlpine}
          rowData={rowData}
          columnDefs={colDefs}
          pinnedBottomRowData={totales}
          getRowStyle={getRowStyle}
          defaultColDef={{ resizable: true, sortable: true }}
          animateRows={true}
        />
      </div>
    </div>
  );
}
