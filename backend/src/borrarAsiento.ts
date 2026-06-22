import { AppSyncResolverEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || '';

export const handler = async (event: AppSyncResolverEvent<{ TenantId: string; Ejercicio: string; IdAsiento: string }>) => {
    console.log("Event:", JSON.stringify(event, null, 2));

    const { TenantId, Ejercicio, IdAsiento } = event.arguments;

    const pkCabecera = `TENANT#${TenantId}#EJER#${Ejercicio}`;

    try {
        // 1. Encontrar todos los items de este asiento (Cabecera y Apuntes)
        // La Cabecera tiene SK = ASIENTO#<fecha>#<IdAsiento>
        // Los Apuntes tienen SK = APUNTE#<IdAsiento>#<Linea>
        // No sabemos la fecha a priori, así que hacemos Query por PK e iteramos para buscar
        // O mejor: Podemos buscar los apuntes (APUNTE#<IdAsiento>#) y deducir la fecha del primero,
        // luego borrar la cabecera.

        const params: any = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: {
                ':pk': pkCabecera,
                ':skPrefix': `APUNTE#${IdAsiento}#`
            }
        };

        const response = await docClient.send(new QueryCommand(params));
        const apuntes = response.Items || [];

        if (apuntes.length === 0) {
            throw new Error(`No se encontraron apuntes para el Asiento ${IdAsiento}.`);
        }

        // 2. Extraer la fecha para poder eliminar la cabecera
        const fecha = apuntes[0].Fecha;
        const skCabecera = `ASIENTO#${fecha}#${IdAsiento}`;

        // 3. Preparar la Transacción de Borrado
        const transactItems: any[] = [];

        // Borrar Cabecera
        transactItems.push({
            Delete: {
                TableName: TABLE_NAME,
                Key: {
                    PK: pkCabecera,
                    SK: skCabecera
                }
            }
        });

        // Borrar Apuntes
        for (const apunte of apuntes) {
            transactItems.push({
                Delete: {
                    TableName: TABLE_NAME,
                    Key: {
                        PK: pkCabecera,
                        SK: apunte.SK
                    }
                }
            });
        }

        // Límite de DynamoDB es 100 por transacción
        if (transactItems.length > 100) {
            throw new Error("El asiento es demasiado grande para ser borrado atómicamente.");
        }

        // 4. Ejecutar Transacción
        await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

        console.log(`Asiento ${IdAsiento} borrado correctamente (Cabecera + ${apuntes.length} apuntes).`);
        return true;

    } catch (error) {
        console.error("Error borrando el asiento:", error);
        throw new Error("No se pudo borrar el asiento atómicamente.");
    }
};
