import React, { forwardRef, useImperativeHandle, useState, useRef } from 'react';
import SubcuentaSelector from './SubcuentaSelector';
import { ICellEditorParams } from 'ag-grid-community';

export default forwardRef((props: ICellEditorParams, ref) => {
    const valueRef = useRef(props.value);
    const [value, setValue] = useState(props.value);

    // AG-Grid usa esto para obtener el valor cuando la edición termina
    useImperativeHandle(ref, () => {
        return {
            getValue: () => {
                console.log("SubcuentaCellEditor getValue() llamado. Devolviendo:", valueRef.current);
                return valueRef.current;
            },
            isCancelBeforeStart: () => {
                return false;
            },
            isCancelAfterEnd: () => {
                return false;
            }
        };
    });

    const handleSelect = (subcuenta: any) => {
        console.log("handleSelect en SubcuentaCellEditor disparado con:", subcuenta);
        if (subcuenta) {
            valueRef.current = subcuenta.CodSubcuenta;
            setValue(subcuenta.CodSubcuenta);
            
            // Forzamos el valor manualmente en el grid para saltarnos el bug de getValue()
            const rowNode = props.api.getRowNode(props.node.id!);
            if (rowNode) {
                // Seteamos el valor de la subcuenta directamente
                rowNode.setDataValue(props.colDef.field!, subcuenta.CodSubcuenta);
                
                // Autocompletamos concepto si está vacío
                if (!rowNode.data.Concepto) {
                    rowNode.setDataValue('Concepto', subcuenta.Descripcion);
                }
            }
            
            // Avanzar automáticamente a la siguiente celda tras seleccionar
            setTimeout(() => {
                props.api.stopEditing();
                
                // Mover foco a Debe
                props.api.setFocusedCell(props.node.rowIndex!, 'Debe');
            }, 0);
        } else {
            valueRef.current = '';
            setValue('');
        }
    };

    return (
        <div className="w-full h-full min-w-[300px] flex items-center bg-white p-1 rounded shadow-lg border">
            <SubcuentaSelector 
                onSelect={handleSelect} 
                autoFocus={true} 
                className="w-full"
                menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
            />
        </div>
    );
});
