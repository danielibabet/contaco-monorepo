'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ModuleRegistry, AllCommunityModule, GridReadyEvent } from 'ag-grid-community';
import { getSession } from 'next-auth/react';
import { useTenant } from '@/context/TenantContext';

ModuleRegistry.registerModules([AllCommunityModule]);

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const LISTAR_SUBCUENTAS_QUERY = `
  query ListarSubcuentas($TenantId: String!) {
    listarSubcuentas(TenantId: $TenantId) {
      CodSubcuenta
      Descripcion
    }
  }
`;

export default function SubcuentasPage() {
  const { tenantId } = useTenant();
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickFilterText, setQuickFilterText] = useState('');
  
  const gridRef = useRef<AgGridReact>(null);

  const [colDefs] = useState<ColDef[]>([
    { field: 'CodSubcuenta', headerName: 'Subcuenta', width: 150, sortable: true, filter: true },
    { field: 'Descripcion', headerName: 'Descripción / Título', flex: 1, sortable: true, filter: true },
  ]);

  const fetchSubcuentas = useCallback(async () => {
    try {
      setLoading(true);
      const session: any = await getSession();
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.accessToken || ''
        },
        body: JSON.stringify({
          query: LISTAR_SUBCUENTAS_QUERY,
          variables: { TenantId: tenantId }
        })
      });
      
      const json = await res.json();
      if (json.errors) {
        throw new Error(json.errors[0].message);
      }
      
      setRowData(json.data.listarSubcuentas || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubcuentas();
  }, [fetchSubcuentas, tenantId]);

  const onFilterTextBoxChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuickFilterText(e.target.value);
  }, []);

  return (
    <div className="flex flex-col h-full gap-4">
      <header className="flex justify-between items-end border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Plan de Cuentas</h1>
          <p className="text-gray-500 mt-1">Busca y filtra subcuentas al instante.</p>
        </div>
        <div className="w-1/3">
          <input 
            type="text" 
            placeholder="Buscar por número o nombre..." 
            className="w-full px-4 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={quickFilterText}
            onChange={onFilterTextBoxChanged}
          />
        </div>
      </header>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md">
          Error: {error}
        </div>
      )}

      <div className="flex-1 w-full relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-75 z-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : null}
        
        <div className="ag-theme-alpine w-full h-full min-h-[500px]">
          <AgGridReact
            ref={gridRef}
            theme="legacy"
            rowData={rowData}
            columnDefs={colDefs}
            quickFilterText={quickFilterText}
            pagination={true}
            paginationPageSize={50}
            animateRows={true}
          />
        </div>
      </div>
    </div>
  );
}
