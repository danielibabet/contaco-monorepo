'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { useTenant } from '@/context/TenantContext';

const LISTAR_FACTURAS_QUERY = `
  query ListarFacturas($TenantId: String!) {
    listarFacturas(TenantId: $TenantId) {
      IdFactura
      Numero
      Tipo
      Fecha
      FechaVencimiento
      Contacto { Nombre CuentaContable }
      Base
      IVA
      Total
      Estado
      EstadoPago
    }
  }
`;

const CREAR_FACTURA_MUTATION = `
  mutation CrearFactura($input: CrearFacturaInput!) {
    crearFactura(input: $input) {
      IdFactura
    }
  }
`;

const REGISTRAR_PAGO_MUTATION = `
  mutation RegistrarPago($TenantId: String!, $Ejercicio: String!, $FacturaId: String!, $FechaPago: String!, $CuentaBanco: String!) {
    registrarPagoFactura(TenantId: $TenantId, Ejercicio: $Ejercicio, FacturaId: $FacturaId, FechaPago: $FechaPago, CuentaBanco: $CuentaBanco)
  }
`;

export default function FacturasPage() {
  const { tenantId, ejercicio } = useTenant();
  const [facturas, setFacturas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [pagoModalOpen, setPagoModalOpen] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<any>(null);

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

  const cargarFacturas = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const data = await fetchGraphQL(LISTAR_FACTURAS_QUERY, { TenantId: tenantId });
      if (data?.listarFacturas) setFacturas(data.listarFacturas);
    } catch (err) {
      console.error("Error al cargar facturas:", err);
      toast.error("Error cargando facturas");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { cargarFacturas(); }, [cargarFacturas]);

  return (
    <div className="flex flex-col gap-6 h-screen w-full relative">
      <header className="flex justify-between items-end border-b border-slate-200 dark:border-slate-700 pb-5 mb-2">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Facturación</h1>
          <p className="text-slate-500 mt-2 font-medium">Gestiona facturas emitidas y recibidas.</p>
        </div>
        <button 
          onClick={() => setModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-md transition-all hover:-translate-y-0.5"
        >
          + Nueva Factura
        </button>
      </header>

      <main className="flex-1 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex justify-center items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-4 px-6 font-semibold">Número</th>
                  <th className="py-4 px-6 font-semibold">Fecha</th>
                  <th className="py-4 px-6 font-semibold">Tipo</th>
                  <th className="py-4 px-6 font-semibold">Contacto</th>
                  <th className="py-4 px-6 font-semibold text-right">Base</th>
                  <th className="py-4 px-6 font-semibold text-right">IVA</th>
                  <th className="py-4 px-6 font-semibold text-right">Total</th>
                  <th className="py-4 px-6 font-semibold text-center">Vencimiento</th>
                  <th className="py-4 px-6 font-semibold text-center">Estado</th>
                  <th className="py-4 px-6 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                {facturas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">No hay facturas registradas.</td>
                  </tr>
                ) : facturas.map((f, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 px-6 font-medium text-slate-900 dark:text-white">{f.Numero}</td>
                    <td className="py-4 px-6">{f.Fecha}</td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${f.Tipo === 'Emitida' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                        {f.Tipo}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-semibold">{f.Contacto.Nombre}</div>
                      <div className="text-xs text-slate-400">{f.Contacto.CuentaContable}</div>
                    </td>
                    <td className="py-4 px-6 text-right tabular-nums">{f.Base.toFixed(2)}€</td>
                    <td className="py-4 px-6 text-right tabular-nums text-slate-400">{f.IVA.toFixed(2)}€</td>
                    <td className="py-4 px-6 text-right tabular-nums font-bold text-slate-900 dark:text-white">{f.Total.toFixed(2)}€</td>
                    <td className="py-4 px-6 text-center tabular-nums text-slate-500">{f.FechaVencimiento}</td>
                    <td className="py-4 px-6 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${f.EstadoPago === 'PAGADO' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                        {f.EstadoPago}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      {f.EstadoPago === 'PENDIENTE' && (
                        <button
                          onClick={() => {
                            setFacturaSeleccionada(f);
                            setPagoModalOpen(true);
                          }}
                          className="text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded transition-colors"
                        >
                          {f.Tipo === 'Emitida' ? 'Cobrar' : 'Pagar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {modalOpen && (
        <NuevaFacturaModal 
          onClose={() => setModalOpen(false)} 
          tenantId={tenantId} 
          ejercicio={ejercicio} 
          onSaved={() => {
            setModalOpen(false);
            cargarFacturas();
          }} 
          fetchGraphQL={fetchGraphQL}
        />
      )}

      {pagoModalOpen && facturaSeleccionada && (
        <RegistrarPagoModal 
          onClose={() => setPagoModalOpen(false)} 
          tenantId={tenantId} 
          ejercicio={ejercicio} 
          factura={facturaSeleccionada}
          onSaved={() => {
            setPagoModalOpen(false);
            cargarFacturas();
          }} 
          fetchGraphQL={fetchGraphQL}
        />
      )}
    </div>
  );
}

function NuevaFacturaModal({ onClose, tenantId, ejercicio, onSaved, fetchGraphQL }: any) {
  const [tipo, setTipo] = useState('Emitida');
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [nombreContacto, setNombreContacto] = useState('');
  const [cuentaContable, setCuentaContable] = useState('');
  const [concepto, setConcepto] = useState('');
  const [base, setBase] = useState('');
  const [tipoIVA, setTipoIVA] = useState('21');
  const [submitting, setSubmitting] = useState(false);

  // Autocompletar la cuenta según el tipo de factura (Pista para el usuario)
  useEffect(() => {
    if (!cuentaContable) {
      if (tipo === 'Emitida') setCuentaContable('4300001');
      if (tipo === 'Recibida') setCuentaContable('4000001');
    }
  }, [tipo]);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const input = {
        TenantId: tenantId,
        Ejercicio: ejercicio,
        Usuario: 'admin',
        Tipo: tipo,
        Numero: numero,
        Fecha: fecha,
        NombreContacto: nombreContacto,
        CuentaContableContacto: cuentaContable,
        Lineas: [
          {
            Concepto: concepto,
            Base: parseFloat(base),
            TipoIVA: parseFloat(tipoIVA)
          }
        ]
      };

      await fetchGraphQL(CREAR_FACTURA_MUTATION, { input });
      toast.success(`Factura ${tipo} creada correctamente`);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear la factura');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Nueva Factura</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} required className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all">
                <option value="Emitida">Emitida (Venta)</option>
                <option value="Recibida">Recibida (Compra)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nº Factura</label>
              <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} required placeholder="Ej: F24-001" className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nombre {tipo === 'Emitida' ? 'Cliente' : 'Proveedor'}</label>
              <input type="text" value={nombreContacto} onChange={(e) => setNombreContacto(e.target.value)} required placeholder={`Nombre del ${tipo === 'Emitida' ? 'Cliente' : 'Proveedor'}`} className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Cuenta Contable</label>
              <input type="text" value={cuentaContable} onChange={(e) => setCuentaContable(e.target.value)} required placeholder={tipo === 'Emitida' ? '430XXXX' : '400XXXX'} className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 items-end">
            <div className="col-span-5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Concepto Lín.</label>
              <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} required placeholder="Descripción del servicio" className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
            </div>
            <div className="col-span-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Base Imp.</label>
              <div className="relative">
                <input type="number" step="0.01" value={base} onChange={(e) => setBase(e.target.value)} required placeholder="0.00" className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 pl-3 pr-8 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-right tabular-nums" />
                <span className="absolute right-3 top-2.5 text-slate-400 font-bold">€</span>
              </div>
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">% IVA</label>
              <select value={tipoIVA} onChange={(e) => setTipoIVA(e.target.value)} required className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all">
                <option value="21">21%</option>
                <option value="10">10%</option>
                <option value="4">4%</option>
                <option value="0">0%</option>
              </select>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-5 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all disabled:opacity-50 disabled:hover:-translate-y-0 flex items-center gap-2">
              {submitting ? 'Procesando...' : 'Crear y Contabilizar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RegistrarPagoModal({ onClose, tenantId, ejercicio, factura, onSaved, fetchGraphQL }: any) {
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0]);
  const [cuentaBanco, setCuentaBanco] = useState('5720000');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const variables = {
        TenantId: tenantId,
        Ejercicio: ejercicio,
        FacturaId: factura.IdFactura,
        FechaPago: fechaPago,
        CuentaBanco: cuentaBanco
      };

      await fetchGraphQL(REGISTRAR_PAGO_MUTATION, variables);
      toast.success(`Pago registrado y contabilizado correctamente`);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {factura.Tipo === 'Emitida' ? 'Registrar Cobro' : 'Registrar Pago'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          
          <div className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 p-4 rounded-xl text-sm font-medium">
            Factura <strong className="font-black">{factura.Numero}</strong> de <strong className="font-black">{factura.Contacto.Nombre}</strong>.<br/>
            Importe a {factura.Tipo === 'Emitida' ? 'cobrar' : 'pagar'}: <strong className="font-black tabular-nums">{factura.Total.toFixed(2)}€</strong>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Fecha de Movimiento</label>
            <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} required className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Cuenta Bancaria / Caja</label>
            <input type="text" value={cuentaBanco} onChange={(e) => setCuentaBanco(e.target.value)} required placeholder="5720000" className="w-full font-mono border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
            <p className="text-xs text-slate-400 mt-1">Cuenta donde se refleja el ingreso/cargo en el extracto.</p>
          </div>

          <div className="mt-2 border-t border-slate-100 dark:border-slate-800 pt-5 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all disabled:opacity-50 flex items-center gap-2">
              {submitting ? 'Procesando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
