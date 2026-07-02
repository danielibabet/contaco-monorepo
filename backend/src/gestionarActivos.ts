import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("gestionarActivos event:", JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const sub = event.identity?.claims?.sub;

  if (!sub) {
    throw new Error("Usuario no autenticado");
  }

  try {
    switch (fieldName) {
      case "listarActivos":
        return await listarActivos(sub, event.arguments.TenantId, event.arguments.Ejercicio);
      case "crearActivo":
        return await crearActivo(sub, event.arguments.input);
      default:
        throw new Error(`Operación GraphQL desconocida: ${fieldName}`);
    }
  } catch (err: any) {
    console.error("Error en gestionarActivos:", err);
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

async function listarActivos(sub: string, tenantId: string, ejercicio: string) {
  const rol = await verificarAccesoTenant(sub, tenantId);
  if (rol !== 'ADMIN') {
    throw new Error("Acceso denegado: Privilegios insuficientes");
  }

  const cmd = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `TENANT#${tenantId}`,
      ":skPrefix": `ACTIVO#${ejercicio}#`
    }
  });

  const res = await docClient.send(cmd);
  
  if (!res.Items || res.Items.length === 0) {
    return [];
  }

  return res.Items;
}

async function crearActivo(sub: string, input: any) {
  const { TenantId, Ejercicio, Nombre, CuentaContable, ValorAdquisicion, MesesAmortizacion, FechaAlta } = input;

  const rol = await verificarAccesoTenant(sub, TenantId);
  if (rol !== 'ADMIN') {
    throw new Error("Acceso denegado: Privilegios insuficientes");
  }

  const cuotaMensual = Math.round((ValorAdquisicion / MesesAmortizacion) * 100) / 100;
  const idActivo = randomUUID().substring(0, 8);
  const now = new Date().toISOString();

  const activoItem = {
    PK: `TENANT#${TenantId}`,
    SK: `ACTIVO#${Ejercicio}#${idActivo}`,
    Type: "Activo",
    Id: idActivo,
    TenantId,
    Ejercicio,
    Nombre,
    CuentaContable,
    ValorAdquisicion,
    MesesAmortizacion,
    CuotaMensual,
    FechaAlta,
    Estado: "ACTIVO",
    MesesAmortizados: 0,
    CreatedAt: now,
    // GSI1 is used by the EventBridge Cron to quickly find active assets globally
    GSI1PK: "ACTIVO",
    GSI1SK: `ACTIVO#${FechaAlta}#${idActivo}`
  };

  const putCmd = new PutCommand({
    TableName: TABLE_NAME,
    Item: activoItem
  });

  await docClient.send(putCmd);

  return activoItem;
}
