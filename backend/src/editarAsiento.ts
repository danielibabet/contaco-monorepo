import { AppSyncResolverEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

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

interface EditarAsientoInput {
    TenantId: string;
    Ejercicio: string;
    IdAsiento: string;
    Fecha: string;
    Observaciones?: string;
    Usuario: string;
    Apuntes: ApunteInput[];
}

export const handler = async (event: AppSyncResolverEvent<{ input: EditarAsientoInput }>) => {
    console.log("Event:", JSON.stringify(event, null, 2));
    
    const { input } = event.arguments;

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

    totalDebe = Math.round(totalDebe * 100) / 100;
    totalHaber = Math.round(totalHaber * 100) / 100;

    if (totalDebe !== totalHaber) {
        throw new Error(`Asiento descuadrado. Total Debe: ${totalDebe}, Total Haber: ${totalHaber}. La diferencia es de ${Math.abs(totalDebe - totalHaber)}.`);
    }

    const pkCabecera = `TENANT#${input.TenantId}#EJER#${input.Ejercicio}`;
    const skCabeceraNueva = `ASIENTO#${input.Fecha}#${input.IdAsiento}`;
    const now = new Date().toISOString();

    try {
        // 2. Buscar Apuntes Antiguos (Para borrarlos)
        const queryParams = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: {
                ':pk': pkCabecera,
                ':skPrefix': `APUNTE#${input.IdAsiento}#`
            }
        };

        const response = await docClient.send(new QueryCommand(queryParams));
        const apuntesAntiguos = response.Items || [];
        
        let fechaAntigua = input.Fecha;
        if (apuntesAntiguos.length > 0) {
            fechaAntigua = apuntesAntiguos[0].Fecha;
        }
        
        const skCabeceraAntigua = `ASIENTO#${fechaAntigua}#${input.IdAsiento}`;

        // 3. Construir Transacción
        const transactItems: any[] = [];

        // --- BORRAR ANTIGUOS ---
        // Borrar Cabecera Antigua
        transactItems.push({
            Delete: {
                TableName: TABLE_NAME,
                Key: { PK: pkCabecera, SK: skCabeceraAntigua }
            }
        });

        // Borrar Apuntes Antiguos
        for (const apunte of apuntesAntiguos) {
            transactItems.push({
                Delete: {
                    TableName: TABLE_NAME,
                    Key: { PK: pkCabecera, SK: apunte.SK }
                }
            });
        }

        // --- CREAR NUEVOS ---
        // Crear Cabecera Nueva
        transactItems.push({
            Put: {
                TableName: TABLE_NAME,
                Item: {
                    PK: pkCabecera,
                    SK: skCabeceraNueva,
                    Type: 'Asiento',
                    IdAsiento: input.IdAsiento,
                    Fecha: input.Fecha,
                    Observaciones: input.Observaciones,
                    Usuario: input.Usuario,
                    Estado: 'Cuadrado',
                    CreatedAt: now,
                    UpdatedAt: now
                }
            }
        });

        // Crear Apuntes Nuevos
        input.Apuntes.forEach((apunte, index) => {
            const linea = (index + 1).toString().padStart(4, '0');
            transactItems.push({
                Put: {
                    TableName: TABLE_NAME,
                    Item: {
                        PK: pkCabecera,
                        SK: `APUNTE#${input.IdAsiento}#${linea}`,
                        Type: 'Apunte',
                        IdAsiento: input.IdAsiento,
                        Linea: linea,
                        Fecha: input.Fecha,
                        SubcuentaId: apunte.SubcuentaId,
                        Concepto: apunte.Concepto,
                        Documento: apunte.Documento,
                        Debe: apunte.Debe,
                        Haber: apunte.Haber,
                        GSI1PK: `TENANT#${input.TenantId}#EJER#${input.Ejercicio}#SUBC#${apunte.SubcuentaId}`,
                        GSI1SK: `FECHA#${input.Fecha}#APUNTE#${input.IdAsiento}#${linea}`
                    }
                }
            });
        });

        // Límite de 100 operaciones
        if (transactItems.length > 100) {
            throw new Error(`El asiento editado genera demasiadas operaciones simultáneas (${transactItems.length}). El límite seguro de líneas en edición es de ~45 apuntes.`);
        }

        // 4. Ejecutar
        await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

        console.log(`Asiento ${input.IdAsiento} editado con éxito.`);
        
        return {
            PK: pkCabecera,
            SK: skCabeceraNueva,
            IdAsiento: input.IdAsiento,
            Fecha: input.Fecha,
            Observaciones: input.Observaciones,
            Usuario: input.Usuario,
            Estado: 'Cuadrado',
            Apuntes: input.Apuntes 
        };

    } catch (error: any) {
        console.error("Error editando el asiento:", error);
        throw new Error(error.message || "No se pudo editar el asiento atómicamente.");
    }
};
