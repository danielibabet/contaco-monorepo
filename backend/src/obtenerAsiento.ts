import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

export const handler = async (event: any) => {
    console.log("obtenerAsiento event:", JSON.stringify(event));
    
    const { TenantId, Ejercicio, IdAsiento } = event.arguments;

    try {
        const result = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `TENANT#${TenantId}`,
                SK: `ASIENTO#${Ejercicio}#${IdAsiento}`
            }
        }));

        return result.Item || null;
    } catch (error) {
        console.error("Error obteniendo asiento:", error);
        throw new Error("No se pudo obtener el asiento.");
    }
};
