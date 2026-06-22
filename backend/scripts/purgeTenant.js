const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' }); // Ajusta tu región
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.argv[2];
const TENANT_ID = process.argv[3];

if (!TABLE_NAME || !TENANT_ID) {
    console.error("Uso: node purgeTenant.js <NombreTablaDynamoDB> <TenantId>");
    process.exit(1);
}

async function purge() {
    console.log(`Iniciando purga del Tenant: ${TENANT_ID} en la tabla ${TABLE_NAME}...`);
    let count = 0;
    let lastEvaluatedKey;

    do {
        const response = await docClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: {
                ':pk': `TENANT#${TENANT_ID}`
            },
            ExclusiveStartKey: lastEvaluatedKey
        }));

        const items = response.Items || [];
        for (const item of items) {
            await docClient.send(new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { PK: item.PK, SK: item.SK }
            }));
            count++;
            if (count % 50 === 0) console.log(`Borrados ${count} registros...`);
        }

        lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`✅ Purga finalizada. Se han destruido ${count} registros asociados al Tenant ${TENANT_ID}. Entorno inmaculado.`);
}

purge().catch(console.error);
