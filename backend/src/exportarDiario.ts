import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

export const handler = async (event: any) => {
    console.log("Event:", JSON.stringify(event, null, 2));

    const { TenantId, Ejercicio } = event.arguments;
    const sub = event.identity?.claims?.sub;

    if (!sub) {
        throw new Error("No autenticado");
    }

    // Autorización
    const authRes = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${sub}`, SK: `TENANT#${TenantId}` }
    }));

    if (!authRes.Item) {
        throw new Error("No autorizado para este Tenant");
    }

    const pkCabecera = `TENANT#${TenantId}#EJER#${Ejercicio}`;
    let allApuntes: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    try {
        do {
            const params = {
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
                ExpressionAttributeValues: {
                    ':pk': pkCabecera,
                    ':skPrefix': 'APUNTE#'
                },
                ExclusiveStartKey: lastEvaluatedKey
            };

            const response = await docClient.send(new QueryCommand(params));
            if (response.Items && response.Items.length > 0) {
                allApuntes = allApuntes.concat(response.Items);
            }
            lastEvaluatedKey = response.LastEvaluatedKey;

        } while (lastEvaluatedKey);

        // Sort by date, id, linea
        allApuntes.sort((a, b) => {
            if (a.Fecha !== b.Fecha) return a.Fecha.localeCompare(b.Fecha);
            if (a.IdAsiento !== b.IdAsiento) return a.IdAsiento.localeCompare(b.IdAsiento);
            return parseInt(a.Linea) - parseInt(b.Linea);
        });

        // Convert to CSV
        const cabeceras = "Fecha;Nº Asiento;Línea;Subcuenta;Concepto;Documento;Debe;Haber\n";
        const lineas = allApuntes.map(a => 
            `"${a.Fecha}";"${a.IdAsiento}";"${a.Linea}";"${a.SubcuentaId}";"${a.Concepto || ''}";"${a.Documento || ''}";"${a.Debe || 0}";"${a.Haber || 0}"`
        ).join("\n");

        const csvString = '\uFEFF' + cabeceras + lineas;

        // Upload to S3
        const fileKey = `exports/${TenantId}/diario_${Ejercicio}_${randomUUID().substring(0, 8)}.csv`;

        const putCmd = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Body: csvString,
            ContentType: 'text/csv'
        });

        await s3Client.send(putCmd);

        // Get Presigned URL for download (expires in 1 day)
        const getCmd = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey
        });
        
        const url = await getSignedUrl(s3Client, getCmd, { expiresIn: 86400 });
        return url;

    } catch (error) {
        console.error("Error exportando el diario:", error);
        throw new Error("No se pudo exportar el diario.");
    }
};
