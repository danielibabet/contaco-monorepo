import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || '';

export const handler = async (event: any) => {
    console.log("Event:", JSON.stringify(event));
    
    // Asumimos que AppSync inyecta los argumentos en event.arguments
    const { TenantId } = event.arguments;

    if (!TenantId) {
        throw new Error("TenantId es requerido");
    }

    try {
        const command = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
            ExpressionAttributeValues: {
                ":pk": `TENANT#${TenantId}`,
                ":skPrefix": "SUBC#"
            }
        });

        const result = await docClient.send(command);
        
        // Mapear el resultado para adaptarlo al schema (CodSubcuenta, Descripcion)
        return (result.Items || []).map(item => ({
            CodSubcuenta: item.SK.replace('SUBC#', ''),
            Descripcion: item.Descripcion || ''
        }));
    } catch (error) {
        console.error("Error consultando subcuentas:", error);
        throw new Error("No se pudieron obtener las subcuentas");
    }
};
