import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { SQSEvent } from "aws-lambda";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const handler = async (event: SQSEvent) => {
    // 1. Extraer los items de la cola SQS
    const putRequests = event.Records.map(record => {
        const payload = JSON.parse(record.body); // Ej: { PK: "...", SK: "...", ... }
        return { PutRequest: { Item: payload } };
    });

    if (putRequests.length === 0) return;

    let requestItems = { [process.env.TABLE_NAME!]: putRequests };
    let retries = 0;
    const maxRetries = 3;

    // 2. Bucle BatchWrite con Exponential Backoff
    while (Object.keys(requestItems).length > 0 && retries < maxRetries) {
        const command = new BatchWriteCommand({ RequestItems: requestItems });
        const response = await docClient.send(command);

        if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
            requestItems = response.UnprocessedItems as any;
            retries++;
            const backoff = Math.pow(2, retries) * 100; // 200ms, 400ms, 800ms
            console.warn(`Unprocessed items detectados. Reintentando en ${backoff}ms...`);
            await sleep(backoff);
        } else {
            requestItems = {}; // Completado
        }
    }

    if (Object.keys(requestItems).length > 0) {
        throw new Error("BatchWrite falló después de múltiples reintentos."); // Mandará a DLQ
    }
};
