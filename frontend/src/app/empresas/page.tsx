'use client';

import React, { useState, useEffect } from 'react';
import { getSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';

const LISTAR_EMPRESAS_QUERY = `
  query ListarEmpresas {
    listarEmpresas {
      TenantId
      Nombre
      RazonSocial
      NIF
      Direccion
      Poblacion
      CodigoPostal
    }
  }
`;

const CREAR_EMPRESA_MUTATION = `
  mutation CrearEmpresa($input: CrearEmpresaInput!) {
    crearEmpresa(input: $input) {
      TenantId
      Nombre
    }
  }
`;

const EDITAR_EMPRESA_MUTATION = `
  mutation EditarEmpresa($input: EditarEmpresaInput!) {
    editarEmpresa(input: $input) {
      TenantId
      Nombre
    }
  }
`;

const BORRAR_EMPRESA_MUTATION = `
  mutation BorrarEmpresa($TenantId: String!) {
    borrarEmpresa(TenantId: $TenantId)
  }
`;

export default function EmpresasPage() {
  const searchParams = useSearchParams();
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);

  // Form state
  const [nombre, setNombre] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [nif, setNif] = useState('');
  const [direccion, setDireccion] = useState('');
  const [poblacion, setPoblacion] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');

  const fetchEmpresas = async () => {
    setLoading(true);
    try {
      const session: any = await getSession();
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: session?.accessToken || '' },
        body: JSON.stringify({ query: LISTAR_EMPRESAS_QUERY })
      });
      const json = await res.json();
      if (json.data?.listarEmpresas) {
        setEmpresas(json.data.listarEmpresas);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Capture the welcome param at mount time (run once)
  const initialWelcome = searchParams.get('welcome') === 'true';

  useEffect(() => {
    fetchEmpresas();
    if (initialWelcome) {
      setIsModalOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateModal = () => {
    setEditingTenant(null);
    setNombre(''); setRazonSocial(''); setNif(''); setDireccion(''); setPoblacion(''); setCodigoPostal('');
    setIsModalOpen(true);
  };

  const openEditModal = (empresa: any) => {
    setEditingTenant(empresa);
    setNombre(empresa.Nombre || '');
    setRazonSocial(empresa.RazonSocial || '');
    setNif(empresa.NIF || '');
    setDireccion(empresa.Direccion || '');
    setPoblacion(empresa.Poblacion || '');
    setCodigoPostal(empresa.CodigoPostal || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const session: any = await getSession();
      const input = {
        Nombre: nombre, RazonSocial: razonSocial, NIF: nif, Direccion: direccion, Poblacion: poblacion, CodigoPostal: codigoPostal
      };

      let query = CREAR_EMPRESA_MUTATION;
      let variables: any = { input };

      if (editingTenant) {
        query = EDITAR_EMPRESA_MUTATION;
        variables = { input: { ...input, TenantId: editingTenant.TenantId } };
      }

      const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: session?.accessToken || '' },
        body: JSON.stringify({ query, variables })
      });
      
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);

      setIsModalOpen(false);
      // DynamoDB Scan is eventually consistent, we add a tiny delay
      setTimeout(() => fetchEmpresas(), 800);
    } catch (err) {
      alert("Error al guardar la empresa: " + String(err));
    }
  };

  const handleDelete = async (tenantId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta empresa? Desaparecerá de todos los listados inmediatamente.")) return;

    try {
      const session: any = await getSession();
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL || '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: session?.accessToken || '' },
        body: JSON.stringify({ query: BORRAR_EMPRESA_MUTATION, variables: { TenantId: tenantId } })
      });
      
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);

      setTimeout(() => fetchEmpresas(), 800);
    } catch (err) {
      alert("Error al eliminar la empresa: " + String(err));
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Gestión de Empresas</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Crea y administra los entornos de tus inquilinos.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Nueva Empresa
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">Cargando empresas...</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Nombre Corto</th>
                <th className="px-6 py-4">Razón Social</th>
                <th className="px-6 py-4">NIF</th>
                <th className="px-6 py-4">Población</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {empresas.map((emp) => (
                <tr key={emp.TenantId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{emp.Nombre}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{emp.RazonSocial || '-'}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-mono text-xs">{emp.NIF || '-'}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{emp.Poblacion || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => openEditModal(emp)} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 p-2">
                      <PencilSquareIcon className="w-5 h-5 inline" />
                    </button>
                    <button onClick={() => handleDelete(emp.TenantId)} className="text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 p-2 ml-2">
                      <TrashIcon className="w-5 h-5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
              {empresas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    No hay empresas registradas. Crea una para empezar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/30">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {editingTenant ? 'Editar Empresa' : 'Nueva Empresa'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Nombre Corto (UI) *</label>
                  <input required value={nombre} onChange={e => setNombre(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100" placeholder="Ej: ContaCo Corp" />
                </div>
                
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Razón Social</label>
                  <input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100" placeholder="Ej: ContaCo S.L." />
                </div>
                
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">NIF</label>
                  <input value={nif} onChange={e => setNif(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 font-mono" placeholder="B12345678" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Dirección Fiscal</label>
                  <input value={direccion} onChange={e => setDireccion(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100" />
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Población</label>
                  <input value={poblacion} onChange={e => setPoblacion(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100" />
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Código Postal</label>
                  <input value={codigoPostal} onChange={e => setCodigoPostal(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100" />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition-colors">
                  {editingTenant ? 'Guardar Cambios' : 'Crear Empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
