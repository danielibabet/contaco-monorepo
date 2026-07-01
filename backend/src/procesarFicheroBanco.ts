import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || '';

export const handler = async (event: any) => {
    console.log("procesarFicheroBanco event");
    
    // Asumimos que podemos recibir TenantId y Ejercicio para consultar DDB
    const { contenidoBase64, TenantId, Ejercicio } = event.arguments;

    if (!TenantId || !Ejercicio) {
        // Fallback si no los mandan (para retrocompatibilidad parcial)
        console.warn("TenantId y Ejercicio no proveídos. No se puede hacer Auto-Match backend.");
    }

    try {
        // 1. Decodificar Base64 y extraer líneas
        const fileContent = Buffer.from(contenidoBase64, 'base64').toString('utf-8');
        const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const movimientos = [];
        let movActual: any = null;

        for (const line of lines) {
            const codigoRegistro = line.substring(0, 2);

            if (codigoRegistro === '22') {
                const fechaStr = line.substring(10, 16);
                const signoStr = line.substring(27, 28);
                const importeStr = line.substring(28, 42);
                
                let year = parseInt(fechaStr.substring(0, 2), 10);
                year += (year > 50 ? 1900 : 2000);
                const month = fechaStr.substring(2, 4);
                const day = fechaStr.substring(4, 6);
                const fechaFormat = `${year}-${month}-${day}`;

                let importe = parseInt(importeStr, 10) / 100.0;
                if (signoStr === '1') {
                    importe = -importe; // Pagos
                }

                movActual = {
                    Fecha: fechaFormat,
                    Importe: importe,
                    Concepto: line.substring(52, 105).trim() || "Movimiento sin concepto",
                    Referencia: "",
                    SugerenciaIdAsiento: null,
                    SugerenciaLinea: null,
                    Fiabilidad: null
                };
                movimientos.push(movActual);

            } else if (codigoRegistro === '23' && movActual) {
                const conceptoExt = line.substring(4, 82).trim();
                movActual.Concepto = movActual.Concepto + " " + conceptoExt;
            }
        }

        // 2. Ejecutar Auto-Match si tenemos contexto
        if (TenantId && Ejercicio) {
            console.log("Consultando apuntes no punteados...");
            
            // Buscar apuntes en 572 (Banco) que no estén punteados. 
            // Esto asume un GSI o un Scan. Como el Single Table Design lo permite, 
            // usar GSI1 donde PK es TenantId#Ejercicio y SK empieza por SUBC#572
            // o simplemente un query en el diario filtrando (más pesado pero realista para demo).
            // Para mantener la consistencia con tu modelo (GSI1):
            
            // Por simplificación, como GSI1 no lo definimos exactamente así para apuntes, 
            // podríamos usar el Scan, pero vamos a asumir un Query genérico al diario
            // O idealmente un Query al Mayor de la subcuenta bancaria (ej: 5720000).
            // Como no sabemos la subcuenta exacta, vamos a cruzar con *cualquier* apunte
            // del ejercicio (poco escalable) o mejor requerir que el usuario seleccione la subcuenta.
            // Para la demo, simularemos el cruce.

            // Nota: En un entorno productivo real, aquí lanzarías un QueryCommand a DDB 
            // para traer los apuntes no punteados de la cuenta bancaria en cuestión.
            /*
            const dbApuntes = await docClient.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI1',
                KeyConditionExpression: "GSI1PK = :pk",
                FilterExpression: "Punteado <> :true",
                ExpressionAttributeValues: {
                    ":pk": `MAYOR#${TenantId}#${Ejercicio}#5720000`,
                    ":true": true
                }
            }));
            const apuntesDisponibles = dbApuntes.Items || [];
            
            // Lógica Auto-Match (ejemplo simplificado)
            const MARGEN_DIAS = 3 * 24 * 60 * 60 * 1000;
            const bancoRestante = [...movimientos];

            apuntesDisponibles.forEach(ap => {
                const apFecha = new Date(ap.Fecha).getTime();
                
                // Match exacto
                let idx = bancoRestante.findIndex(b => b.Importe === ap.Debe - ap.Haber && new Date(b.Fecha).getTime() === apFecha);
                if (idx !== -1) {
                    bancoRestante[idx].SugerenciaIdAsiento = ap.IdAsiento;
                    bancoRestante[idx].SugerenciaLinea = ap.Linea;
                    bancoRestante[idx].Fiabilidad = 'EXACTO';
                    bancoRestante.splice(idx, 1);
                    return;
                }

                // Match sugerido
                idx = bancoRestante.findIndex(b => b.Importe === ap.Debe - ap.Haber && Math.abs(new Date(b.Fecha).getTime() - apFecha) <= MARGEN_DIAS);
                if (idx !== -1) {
                    bancoRestante[idx].SugerenciaIdAsiento = ap.IdAsiento;
                    bancoRestante[idx].SugerenciaLinea = ap.Linea;
                    bancoRestante[idx].Fiabilidad = 'SUGERIDO';
                    bancoRestante.splice(idx, 1);
                }
            });
            */
            console.log("Auto-match procesado (Mockup mode on DDB integration)");
        }

        return movimientos;
    } catch (error) {
        console.error("Error procesando N43:", error);
        throw new Error("No se pudo procesar el fichero Norma 43.");
    }
};
