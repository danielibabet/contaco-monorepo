import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || '';

export const handler = async (event: any) => {
    console.log("Event:", JSON.stringify(event));
    
    const { TenantId, Ejercicio, SubcuentaId } = event.arguments;

    if (!TenantId || !Ejercicio || !SubcuentaId) {
        throw new Error("TenantId, Ejercicio y SubcuentaId son requeridos");
    }

    try {
        const command = new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI1',
            KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)",
            ExpressionAttributeValues: {
                ":pk": `TENANT#${TenantId}#EJER#${Ejercicio}#SUBC#${SubcuentaId}`,
                ":skPrefix": "FECHA#"
            }
        });

        const result = await docClient.send(command);
        const apuntesCrudos = result.Items || [];

        let saldoActual = 0;
        const lineas = apuntesCrudos.map(item => {
            const debe = item.Debe || 0;
            const haber = item.Haber || 0;
            saldoActual = saldoActual + debe - haber;

            return {
                IdAsiento: item.IdAsiento,
                Linea: item.Linea,
                Fecha: item.Fecha,
                Concepto: item.Concepto,
                Documento: item.Documento || '',
                Debe: debe,
                Haber: haber,
                Saldo: Math.round(saldoActual * 100) / 100
            };
        });

        return {
            SubcuentaId: SubcuentaId,
            SaldoFinal: Math.round(saldoActual * 100) / 100,
            Apuntes: lineas
        };

    } catch (error) {
        console.error("Error obteniendo libro mayor:", error);
        throw new Error("No se pudo obtener el libro mayor de la subcuenta");
    }
};
