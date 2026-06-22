import { NextRequest, NextResponse } from 'next/server';
import { DBFFile } from 'dbffile';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const tenantId = formData.get('tenantId') as string;
    const ejercicio = formData.get('ejercicio') as string;

    if (!file || !tenantId || !ejercicio) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos (file, tenantId, ejercicio)' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tmpDir = os.tmpdir();
    const tempFilePath = path.join(tmpDir, `parse-${Date.now()}.dbf`);
    await fs.writeFile(tempFilePath, buffer);

    // Parsear DBF con encoding legacy
    const dbf = await DBFFile.open(tempFilePath, { encoding: 'CP850' });
    const records = await dbf.readRecords();

    // Eliminar archivo temporal
    await fs.unlink(tempFilePath);

    let putRequests: any[] = [];
    const isDiario = records.length > 0 && ('ASIENTO' in records[0] || 'ASTO' in records[0]);

    if (!isDiario) {
        // --- PROCESAR SUBCUENTAS ---
        putRequests = records.map((record: any) => {
            const codigo = record.COD || record.SUBCUENTA || record.CODIGO || '';
            const descripcion = record.TITULO || record.DESCRIP || record.NOMBRE || '';
            
            return {
                PutRequest: {
                    Item: {
                        PK: `TENANT#${tenantId}`,
                        SK: `SUBC#${String(codigo).trim()}`,
                        Type: "Subcuenta",
                        Descripcion: String(descripcion).trim(),
                        CreatedAt: new Date().toISOString()
                    }
                }
            };
        }).filter(req => req.PutRequest.Item.SK !== 'SUBC#');
    } else {
        // --- PROCESAR DIARIO ---
        // Contaplus DIARIO guarda línea a línea. Necesitamos agrupar por ASIENTO y FECHA.
        // Formato DynamoDB:
        // Cabecera: PK: TENANT#empresa-demo-01#EJER#2026, SK: ASIENTO#2026-01-01#123
        // Apunte: PK: TENANT#empresa-demo-01#EJER#2026, SK: APUNTE#123#0001
        
        // 1. Agrupar por Asiento y Fecha
        const asientosAgrupados: Record<string, any[]> = {};

        records.forEach((record: any) => {
            const numAsiento = record.ASIENTO || record.ASTO || '';
            const fechaRaw = record.FECHA; // Suele venir como Date o string (YYYYMMDD o YYYY-MM-DD)
            let fechaISO = '';
            
            if (fechaRaw instanceof Date) {
                fechaISO = fechaRaw.toISOString().split('T')[0];
            } else if (typeof fechaRaw === 'string') {
                if (fechaRaw.length === 8) { // YYYYMMDD
                    fechaISO = `${fechaRaw.substring(0,4)}-${fechaRaw.substring(4,6)}-${fechaRaw.substring(6,8)}`;
                } else {
                    fechaISO = fechaRaw; // Esperamos que esté bien
                }
            } else {
                fechaISO = '2026-01-01'; // Fallback
            }

            const key = `${numAsiento}_${fechaISO}`;
            if (!asientosAgrupados[key]) {
                asientosAgrupados[key] = [];
            }
            asientosAgrupados[key].push({
                ...record,
                _fechaISO: fechaISO,
                _numAsiento: numAsiento
            });
        });

        // 2. Generar PutRequests para Cabeceras y Apuntes
        const now = new Date().toISOString();
        const pkBase = `TENANT#${tenantId}#EJER#${ejercicio}`;

        Object.keys(asientosAgrupados).forEach(key => {
            const lineas = asientosAgrupados[key];
            const numAsiento = lineas[0]._numAsiento;
            const fechaISO = lineas[0]._fechaISO;

            // Añadir Cabecera
            putRequests.push({
                PutRequest: {
                    Item: {
                        PK: pkBase,
                        SK: `ASIENTO#${fechaISO}#${numAsiento}`,
                        Type: 'Asiento',
                        IdAsiento: String(numAsiento),
                        Fecha: fechaISO,
                        Observaciones: 'Importado de Contaplus',
                        Usuario: 'migracion',
                        Estado: 'Cuadrado',
                        CreatedAt: now
                    }
                }
            });

            // Añadir Líneas (Apuntes)
            lineas.forEach((linea: any, idx: number) => {
                const numLinea = String(idx + 1).padStart(4, '0');
                const subcuenta = linea.SUBCUENTA || linea.CTA || '';
                const concepto = linea.CONCEPTO || '';
                const documento = linea.DOC || linea.DOCUMENTO || '';
                const debe = Number(linea.DEBE) || 0;
                const haber = Number(linea.HABER) || 0;

                putRequests.push({
                    PutRequest: {
                        Item: {
                            PK: pkBase,
                            SK: `APUNTE#${numAsiento}#${numLinea}`,
                            Type: 'Apunte',
                            IdAsiento: String(numAsiento),
                            Linea: numLinea,
                            Fecha: fechaISO,
                            SubcuentaId: String(subcuenta),
                            Concepto: String(concepto),
                            Documento: String(documento),
                            Debe: debe,
                            Haber: haber,
                            // Para Libro Mayor (GSI1)
                            GSI1PK: `TENANT#${tenantId}#EJER#${ejercicio}#SUBC#${String(subcuenta)}`,
                            GSI1SK: `FECHA#${fechaISO}#APUNTE#${numAsiento}#${numLinea}`
                        }
                    }
                });
            });
        });
    }

    return NextResponse.json({
      success: true,
      totalItems: putRequests.length,
      putRequests: putRequests
    });

  } catch (error: any) {
    console.error('Error al parsear DBF:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
