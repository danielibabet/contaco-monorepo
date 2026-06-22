import { AppSyncResolverEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || '';

export const handler = async (event: AppSyncResolverEvent<{ TenantId: string; Ejercicio: string; Trimestre: number }>) => {
    console.log("Event:", JSON.stringify(event, null, 2));

    const { TenantId, Ejercicio, Trimestre } = event.arguments;

    // Rango de fechas por trimestre
    const year = parseInt(Ejercicio);
    let startDate = '';
    let endDate = '';

    switch (Trimestre) {
        case 1: startDate = `${year}-01-01`; endDate = `${year}-03-31`; break;
        case 2: startDate = `${year}-04-01`; endDate = `${year}-06-30`; break;
        case 3: startDate = `${year}-07-01`; endDate = `${year}-09-30`; break;
        case 4: startDate = `${year}-10-01`; endDate = `${year}-12-31`; break;
        default: throw new Error("El Trimestre debe ser entre 1 y 4");
    }

    try {
        // PASO 1: Obtener la lista de subcuentas que empiezan por 472 y 477
        const pkTenant = `TENANT#${TenantId}`;
        
        // Consultar 472 (Soportado)
        const query472 = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: { ':pk': pkTenant, ':skPrefix': 'SUBC#472' }
        });

        // Consultar 477 (Repercutido)
        const query477 = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: { ':pk': pkTenant, ':skPrefix': 'SUBC#477' }
        });

        const [res472, res477] = await Promise.all([docClient.send(query472), docClient.send(query477)]);
        
        const subcuentasSoportado = (res472.Items || []).map(i => i.CodSubcuenta);
        const subcuentasRepercutido = (res477.Items || []).map(i => i.CodSubcuenta);

        console.log("Cuentas IVA Soportado (472):", subcuentasSoportado);
        console.log("Cuentas IVA Repercutido (477):", subcuentasRepercutido);

        // PASO 2: Consultar GSI1 para obtener los apuntes en ese rango de fechas por cada cuenta
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

        // PASO 3: Sumarizar saldos
        let ivaDevengado = 0; // Repercutido (477) -> Haber - Debe
        let ivaDeducible = 0; // Soportado (472) -> Debe - Haber

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

        // Redondear a 2 decimales para evitar problemas de coma flotante
        ivaDevengado = Math.round(ivaDevengado * 100) / 100;
        ivaDeducible = Math.round(ivaDeducible * 100) / 100;
        
        const resultado = Math.round((ivaDevengado - ivaDeducible) * 100) / 100;

        return {
            Trimestre,
            IvaDevengado: ivaDevengado,
            IvaDeducible: ivaDeducible,
            Resultado: resultado
        };

    } catch (error) {
        console.error("Error calculando el Modelo 303:", error);
        throw new Error("No se pudo calcular el Modelo 303 de IVA.");
    }
};
