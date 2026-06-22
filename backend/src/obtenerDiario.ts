import { AppSyncResolverEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || '';

export const handler = async (event: AppSyncResolverEvent<{ TenantId: string; Ejercicio: string }>) => {
    console.log("Event:", JSON.stringify(event, null, 2));

    const { TenantId, Ejercicio } = event.arguments;

    const pkCabecera = `TENANT#${TenantId}#EJER#${Ejercicio}`;
    let allApuntes: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    try {
        do {
            const params: QueryCommandInput = {
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
                ExpressionAttributeValues: {
                    ':pk': pkCabecera,
                    ':skPrefix': 'APUNTE#'
                },
                ExclusiveStartKey: lastEvaluatedKey
            };

            const command = new QueryCommand(params);
            const response = await docClient.send(command);

            if (response.Items && response.Items.length > 0) {
                allApuntes = allApuntes.concat(response.Items);
            }

            lastEvaluatedKey = response.LastEvaluatedKey;

        } while (lastEvaluatedKey); // Bucle para superar el límite de 1MB de DynamoDB

        console.log(`Se recuperaron ${allApuntes.length} apuntes del diario.`);

        // Devolvemos el array plano. La ordenación por fecha la hace ag-Grid en el cliente
        // para ahorrar CPU e índices en DynamoDB.
        return allApuntes;

    } catch (error) {
        console.error("Error obteniendo el diario:", error);
        throw new Error("No se pudo obtener el diario histórico.");
    }
};
