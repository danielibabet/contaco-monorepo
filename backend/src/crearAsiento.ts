import { AppSyncResolverEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || '';

interface ApunteInput {
    SubcuentaId: string;
    Concepto: string;
    Documento?: string;
    Debe: number;
    Haber: number;
}

interface CrearAsientoInput {
    TenantId: string;
    Ejercicio: string;
    Fecha: string;
    Observaciones?: string;
    Usuario: string;
    Apuntes: ApunteInput[];
}

export const handler = async (event: any) => {
    console.log("Event:", JSON.stringify(event, null, 2));
    
    const { input } = event.arguments;
    const sub = event.identity?.claims?.sub;

    if (!sub) {
        throw new Error("No autenticado");
    }

    // Autorización
    const authRes = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${sub}`, SK: `TENANT#${input.TenantId}` }
    }));

    if (!authRes.Item) {
        throw new Error("No autorizado para este Tenant");
    }

    if (!input.Apuntes || input.Apuntes.length === 0) {
        throw new Error("El asiento debe contener al menos un apunte.");
    }

    // 1. Validación de Partida Doble (Total Debe == Total Haber)
    let totalDebe = 0;
    let totalHaber = 0;

    for (const apunte of input.Apuntes) {
        totalDebe += apunte.Debe;
        totalHaber += apunte.Haber;
    }

    // Redondear a 2 decimales para evitar problemas de coma flotante
    totalDebe = Math.round(totalDebe * 100) / 100;
    totalHaber = Math.round(totalHaber * 100) / 100;

    if (totalDebe !== totalHaber) {
        throw new Error(`Asiento descuadrado. Total Debe: ${totalDebe}, Total Haber: ${totalHaber}. La diferencia es de ${Math.abs(totalDebe - totalHaber)}.`);
    }

    // 2. Generar IDs únicos
    // En Contaplus el ID de asiento suele ser secuencial. Para Serverless, podemos usar un UUID corto
    const idAsiento = randomUUID().substring(0, 8); 
    
    const pkCabecera = `TENANT#${input.TenantId}#EJER#${input.Ejercicio}`;
    const skCabecera = `ASIENTO#${input.Fecha}#${idAsiento}`;
    
    const now = new Date().toISOString();

    // 3. Preparar la transacción (Todo o Nada)
    const transactItems: any[] = [];

    // Añadir Cabecera del Asiento
    transactItems.push({
        Put: {
            TableName: TABLE_NAME,
            Item: {
                PK: pkCabecera,
                SK: skCabecera,
                Type: 'Asiento',
                IdAsiento: idAsiento,
                Fecha: input.Fecha,
                Observaciones: input.Observaciones,
                Usuario: input.Usuario,
                Estado: 'Cuadrado',
                CreatedAt: now
            }
        }
    });

    // Añadir cada Apunte
    input.Apuntes.forEach((apunte, index) => {
        // Linea formateada a 4 dígitos (ej. "0001")
        const linea = (index + 1).toString().padStart(4, '0');
        
        transactItems.push({
            Put: {
                TableName: TABLE_NAME,
                Item: {
                    PK: pkCabecera,
                    SK: `APUNTE#${idAsiento}#${linea}`,
                    Type: 'Apunte',
                    IdAsiento: idAsiento,
                    Linea: linea,
                    Fecha: input.Fecha,
                    SubcuentaId: apunte.SubcuentaId,
                    Concepto: apunte.Concepto,
                    Documento: apunte.Documento,
                    Debe: apunte.Debe,
                    Haber: apunte.Haber,
                    // Para Libro Mayor
                    GSI1PK: `TENANT#${input.TenantId}#EJER#${input.Ejercicio}#SUBC#${apunte.SubcuentaId}`,
                    GSI1SK: `FECHA#${input.Fecha}#APUNTE#${idAsiento}#${linea}`
                }
            }
        });
    });

    // Validar límite de DynamoDB TransactWrite (máximo 100 operaciones por tx)
    if (transactItems.length > 100) {
        throw new Error("El asiento tiene demasiados apuntes para una sola transacción.");
    }

    try {
        const command = new TransactWriteCommand({ TransactItems: transactItems });
        await docClient.send(command);
        
        console.log(`Asiento ${idAsiento} creado con éxito.`);
        
        // Devolver la respuesta en formato Asiento
        return {
            PK: pkCabecera,
            SK: skCabecera,
            IdAsiento: idAsiento,
            Fecha: input.Fecha,
            Observaciones: input.Observaciones,
            Usuario: input.Usuario,
            Estado: 'Cuadrado',
            Apuntes: input.Apuntes // Esto coincidirá con GraphQL Type
        };

    } catch (error) {
        console.error("Error guardando el asiento en DynamoDB:", error);
        throw new Error("Error interno guardando el asiento.");
    }
};
