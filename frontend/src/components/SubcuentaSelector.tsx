import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import { getSession } from 'next-auth/react';
import { useTenant } from '@/context/TenantContext';

interface Subcuenta {
  CodSubcuenta: string;
  Descripcion: string;
}

interface SubcuentaSelectorProps {
  onSelect: (subcuenta: Subcuenta | null) => void;
  className?: string;
  autoFocus?: boolean;
  menuPortalTarget?: HTMLElement | null;
}

const LISTAR_SUBCUENTAS_QUERY = `
  query ListarSubcuentas($TenantId: String!) {
    listarSubcuentas(TenantId: $TenantId) {
      CodSubcuenta
      Descripcion
    }
  }
`;

export default function SubcuentaSelector({ onSelect, className, autoFocus, menuPortalTarget }: SubcuentaSelectorProps) {
  const { tenantId } = useTenant();
  const [options, setOptions] = useState<{ value: string; label: string; raw: Subcuenta }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSubcuentas() {
      try {
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
        if (json.data && json.data.listarSubcuentas) {
          const formattedOptions = json.data.listarSubcuentas.map((s: Subcuenta) => ({
            value: s.CodSubcuenta,
            label: `${s.CodSubcuenta} - ${s.Descripcion}`,
            raw: s
          }));
          setOptions(formattedOptions);
        }
      } catch (err) {
        console.error("Error loading subcuentas:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSubcuentas();
  }, [tenantId]);

  const handleChange = (selectedOption: any) => {
    if (selectedOption) {
      onSelect(selectedOption.raw);
    } else {
      onSelect(null);
    }
  };

  // Personalización de react-select para Tailwind y look & feel
  const customStyles = {
    control: (base: any, state: any) => ({
      ...base,
      borderColor: state.isFocused ? '#3b82f6' : '#d1d5db',
      boxShadow: state.isFocused ? '0 0 0 1px #3b82f6' : 'none',
      '&:hover': {
        borderColor: state.isFocused ? '#3b82f6' : '#9ca3af'
      },
      padding: '2px',
      borderRadius: '0.5rem',
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected 
        ? '#3b82f6' 
        : state.isFocused 
          ? '#eff6ff' 
          : 'white',
      color: state.isSelected ? 'white' : '#1f2937',
      cursor: 'pointer',
    })
  };

  return (
    <div className={`w-full max-w-md ${className}`}>
      <Select
        autoFocus={autoFocus}
        defaultMenuIsOpen={autoFocus}
        options={options}
        isLoading={isLoading}
        onChange={handleChange}
        placeholder="Teclea la subcuenta o busca por nombre..."
        isClearable
        menuPosition="fixed"
        {...(menuPortalTarget ? { menuPortalTarget } : {})}
        styles={{
            ...customStyles,
            menuPortal: base => ({ ...base, zIndex: 9999 }),
            menu: base => ({ ...base, zIndex: 9999 })
        }}
        noOptionsMessage={() => "No se han encontrado subcuentas"}
        filterOption={(option, inputValue) => {
            // Permitir búsqueda por Código o por Descripción
            const searchStr = inputValue.toLowerCase();
            return (
                option.data.raw.CodSubcuenta.toLowerCase().includes(searchStr) ||
                option.data.raw.Descripcion.toLowerCase().includes(searchStr)
            );
        }}
      />
    </div>
  );
}
