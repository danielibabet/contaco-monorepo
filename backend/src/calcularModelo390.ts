import { AppSyncResolverEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || '';

export const handler = async (event: AppSyncResolverEvent<{ TenantId: string; Ejercicio: string }>) => {
    console.log("Event:", JSON.stringify(event, null, 2));

    const { TenantId, Ejercicio } = event.arguments;

    const year = parseInt(Ejercicio);
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    try {
        const pkTenant = `TENANT#${TenantId}`;
        
        const query472 = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: { ':pk': pkTenant, ':skPrefix': 'SUBC#472' }
        });

        const query477 = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: { ':pk': pkTenant, ':skPrefix': 'SUBC#477' }
        });

        const [res472, res477] = await Promise.all([docClient.send(query472), docClient.send(query477)]);
        
        const subcuentasSoportado = (res472.Items || []).map(i => i.CodSubcuenta);
        const subcuentasRepercutido = (res477.Items || []).map(i => i.CodSubcuenta);

        const fetchApuntesPorCuenta = async (subcuenta: string) => {
            const gsiPk = `TENANT#${TenantId}#EJER#${Ejercicio}#SUBC#${subcuenta}`;
            const apuntes: any[] = [];
            let lastEvaluatedKey = undefined;

            do {
                const params: any = {
                    TableName: TABLE_NAME,
                    IndexName: 'GSI1',
                    KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :start AND :end',
                    ExpressionAttributeValues: {
                        ':pk': gsiPk,
                        ':start': `FECHA#${startDate}#`,
                        ':end': `FECHA#${endDate}#\uffff`
                    },
                    ExclusiveStartKey: lastEvaluatedKey
                };
                
                const response = await docClient.send(new QueryCommand(params));
                if (response.Items) apuntes.push(...response.Items);
                lastEvaluatedKey = response.LastEvaluatedKey;
            } while (lastEvaluatedKey);

            return apuntes;
        };

        const allCuentas = [...subcuentasSoportado, ...subcuentasRepercutido];
        const promesasApuntes = allCuentas.map(cuenta => fetchApuntesPorCuenta(cuenta));
        const resultadosApuntes = await Promise.all(promesasApuntes);

        let ivaDevengado = 0;
        let ivaDeducible = 0;

        allCuentas.forEach((cuenta, index) => {
            const apuntesDeLaCuenta = resultadosApuntes[index];
            
            let saldoDebe = 0;
            let saldoHaber = 0;

            for (const apunte of apuntesDeLaCuenta) {
                saldoDebe += apunte.Debe || 0;
                saldoHaber += apunte.Haber || 0;
            }

            if (cuenta.startsWith('477')) {
                ivaDevengado += (saldoHaber - saldoDebe);
            } else if (cuenta.startsWith('472')) {
                ivaDeducible += (saldoDebe - saldoHaber);
            }
        });

        ivaDevengado = Math.round(ivaDevengado * 100) / 100;
        ivaDeducible = Math.round(ivaDeducible * 100) / 100;
        const resultado = Math.round((ivaDevengado - ivaDeducible) * 100) / 100;

        return {
            Ejercicio,
            IvaDevengado: ivaDevengado,
            IvaDeducible: ivaDeducible,
            Resultado: resultado
        };

    } catch (error) {
        console.error("Error calculando el Modelo 390:", error);
        throw new Error("No se pudo calcular el Modelo 390.");
    }
};
