const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'ContaCoTable';
const tenantId = 'empresa-demo-01';

const subcuentasDummy = [
    { CodSubcuenta: '1000000', Descripcion: 'Capital Social' },
    { CodSubcuenta: '4000001', Descripcion: 'Proveedores, Empresa A' },
    { CodSubcuenta: '4000002', Descripcion: 'Proveedores, Suministros B' },
    { CodSubcuenta: '4300001', Descripcion: 'Clientes, Juan Pérez' },
    { CodSubcuenta: '4300002', Descripcion: 'Clientes, Empresa X' },
    { CodSubcuenta: '4720000', Descripcion: 'H.P. IVA Soportado' },
    { CodSubcuenta: '4770000', Descripcion: 'H.P. IVA Repercutido' },
    { CodSubcuenta: '5720001', Descripcion: 'Banco Santander C/C' },
    { CodSubcuenta: '5720002', Descripcion: 'BBVA C/C' },
    { CodSubcuenta: '6000000', Descripcion: 'Compras de mercaderías' },
    { CodSubcuenta: '6280000', Descripcion: 'Suministros (Agua, Luz)' },
    { CodSubcuenta: '7000000', Descripcion: 'Ventas de mercaderías' },
];

const putRequests = subcuentasDummy.map(subc => ({
    PutRequest: {
        Item: {
            PK: `TENANT#${tenantId}`,
            SK: `SUBC#${subc.CodSubcuenta}`,
            Type: 'Subcuenta',
            Descripcion: subc.Descripcion,
            CreatedAt: new Date().toISOString()
        }
    }
}));

async function seed() {
    console.log(`Inyectando ${putRequests.length} subcuentas de prueba...`);
    try {
        await docClient.send(new BatchWriteCommand({
            RequestItems: {
                [TABLE_NAME]: putRequests
            }
        }));
        console.log('✅ ¡Subcuentas inyectadas con éxito en DynamoDB!');
    } catch (err) {
        console.error('❌ Error inyectando datos:', err);
    }
}

seed();
