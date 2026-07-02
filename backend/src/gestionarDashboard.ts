import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("gestionarDashboard event:", JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const sub = event.identity?.claims?.sub;

  if (!sub) {
    throw new Error("Usuario no autenticado");
  }

  try {
    switch (fieldName) {
      case "obtenerDashboardStats":
        return await obtenerDashboardStats(sub, event.arguments.TenantId, event.arguments.Ejercicio);
      case "obtenerIngresosMensuales":
        return await obtenerIngresosMensuales(sub, event.arguments.TenantId, event.arguments.Ejercicio);
      default:
        throw new Error(`Operación GraphQL desconocida: ${fieldName}`);
    }
  } catch (err: any) {
    console.error("Error en gestionarDashboard:", err);
    throw new Error(err.message);
  }
};

async function verificarAccesoTenant(sub: string, tenantId: string) {
  const cmd = new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${sub}`,
      SK: `TENANT#${tenantId}`
    }
  });
  const res = await docClient.send(cmd);
  if (!res.Item) {
    throw new Error("No autorizado para acceder a este Tenant");
  }
  return res.Item.Rol || "EMPLEADO";
}

async function fetchTodasFacturas(tenantId: string, ejercicio: string) {
  const facturas: any[] = [];
  let lastEvaluatedKey: any = undefined;

  do {
    const cmd = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `TENANT#${tenantId}`,
        ":skPrefix": `FACTURA#${ejercicio}#`
      },
      ExclusiveStartKey: lastEvaluatedKey
    });

    const res = await docClient.send(cmd);
    if (res.Items) {
      facturas.push(...res.Items);
    }
    lastEvaluatedKey = res.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return facturas;
}

async function obtenerDashboardStats(sub: string, tenantId: string, ejercicio: string) {
  const rol = await verificarAccesoTenant(sub, tenantId);
  if (rol !== 'ADMIN') {
    throw new Error("Acceso denegado: Privilegios insuficientes");
  }

  const facturas = await fetchTodasFacturas(tenantId, ejercicio);

  let totalIngresos = 0;
  let totalGastos = 0;
  let pendienteCobro = 0;
  let pendientePago = 0;

  for (const f of facturas) {
    if (f.Tipo === 'Emitida') {
      totalIngresos += f.Base || 0;
      if (f.EstadoPago === 'PENDIENTE') {
        pendienteCobro += f.Total || 0;
      }
    } else if (f.Tipo === 'Recibida') {
      totalGastos += f.Base || 0;
      if (f.EstadoPago === 'PENDIENTE') {
        pendientePago += f.Total || 0;
      }
    }
  }

  return {
    TotalIngresos: Math.round(totalIngresos * 100) / 100,
    TotalGastos: Math.round(totalGastos * 100) / 100,
    PendienteCobro: Math.round(pendienteCobro * 100) / 100,
    PendientePago: Math.round(pendientePago * 100) / 100
  };
}

async function obtenerIngresosMensuales(sub: string, tenantId: string, ejercicio: string) {
  const rol = await verificarAccesoTenant(sub, tenantId);
  if (rol !== 'ADMIN') {
    throw new Error("Acceso denegado: Privilegios insuficientes");
  }

  const facturas = await fetchTodasFacturas(tenantId, ejercicio);

  // Inicializar meses del año en español
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const resultados = meses.map(m => ({ mes: m, valor: 0 }));

  for (const f of facturas) {
    if (f.Tipo === 'Emitida' && f.Fecha) {
      // Fecha formato YYYY-MM-DD
      const parts = f.Fecha.split('-');
      if (parts.length >= 2) {
        const monthIndex = parseInt(parts[1], 10) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
          resultados[monthIndex].valor += f.Base || 0;
        }
      }
    }
  }

  // Redondear valores
  resultados.forEach(r => {
    r.valor = Math.round(r.valor * 100) / 100;
  });

  return resultados;
}
