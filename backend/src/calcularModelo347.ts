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
        
        // 1. Obtener clientes (43, 44) y proveedores (40, 41)
        const groups = ['43', '44', '40', '41'];
        let subcuentas: any[] = [];
        
        for (const grp of groups) {
            let lastKey = undefined;
            do {
                const q: any = new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
                    ExpressionAttributeValues: { ':pk': pkTenant, ':skPrefix': `SUBC#${grp}` },
                    ExclusiveStartKey: lastKey
                });
                const res: any = await docClient.send(q);
                if (res.Items) subcuentas.push(...res.Items);
                lastKey = res.LastEvaluatedKey;
            } while(lastKey);
        }

        // 2. Por cada subcuenta, sumar apuntes
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

        const resultados: any[] = [];

        // Concurrencia controlada para no saturar DynamoDB (batches de 10)
        for (let i = 0; i < subcuentas.length; i += 10) {
            const batch = subcuentas.slice(i, i + 10);
            const promesas = batch.map(sc => fetchApuntesPorCuenta(sc.CodSubcuenta));
            const batchResultados = await Promise.all(promesas);

            batch.forEach((sc, idx) => {
                const apuntes = batchResultados[idx];
                let totalOperaciones = 0;

                for (const apunte of apuntes) {
                    // Ignorar asientos de cierre o regularización
                    if (apunte.IdAsiento === 'AST-CIERRE' || apunte.IdAsiento === 'AST-REGULARIZACION') continue;
                    
                    if (sc.CodSubcuenta.startsWith('43') || sc.CodSubcuenta.startsWith('44')) {
                        // Cliente: facturación en el Debe
                        totalOperaciones += (apunte.Debe || 0);
                    } else if (sc.CodSubcuenta.startsWith('40') || sc.CodSubcuenta.startsWith('41')) {
                        // Proveedor: facturación en el Haber
                        totalOperaciones += (apunte.Haber || 0);
                    }
                }

                totalOperaciones = Math.round(totalOperaciones * 100) / 100;

                if (totalOperaciones > 3005.06) {
                    resultados.push({
                        SubcuentaId: sc.CodSubcuenta,
                        Nombre: sc.Nombre || sc.Descripcion || 'Desconocido',
                        Nif: sc.Nif || 'Falta NIF',
                        TotalOperaciones: totalOperaciones
                    });
                }
            });
        }

        // Ordenar resultados de mayor a menor importe
        resultados.sort((a, b) => b.TotalOperaciones - a.TotalOperaciones);

        return resultados;

    } catch (error) {
        console.error("Error calculando el Modelo 347:", error);
        throw new Error("No se pudo calcular el Modelo 347.");
    }
};
