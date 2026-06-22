import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("gestionarPlantillas event:", JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;

  try {
    switch (fieldName) {
      case "listarPlantillas":
        return await listarPlantillas(event.arguments.TenantId);
      case "crearPlantilla":
        return await crearPlantilla(event.arguments.input);
      case "borrarPlantilla":
        return await borrarPlantilla(event.arguments.TenantId, event.arguments.TemplateId);
      default:
        throw new Error(`Operación GraphQL desconocida: ${fieldName}`);
    }
  } catch (err: any) {
    console.error("Error en gestionarPlantillas:", err);
    throw new Error(err.message);
  }
};

async function listarPlantillas(tenantId: string) {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `TENANT#${tenantId}`,
      ":skPrefix": "TEMPLATE#"
    }
  };

  const data = await docClient.send(new QueryCommand(params));
  return data.Items || [];
}

async function crearPlantilla(input: any) {
  const templateId = randomUUID();
  const pk = `TENANT#${input.TenantId}`;
  const sk = `TEMPLATE#${templateId}`;

  const plantillaItem = {
    PK: pk,
    SK: sk,
    TemplateId: templateId,
    NombrePlantilla: input.NombrePlantilla,
    Lineas: input.Lineas, // array of {SubcuentaId, Concepto, Porcentaje, Columna}
    CreatedAt: new Date().toISOString()
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: plantillaItem
  }));

  return plantillaItem;
}

async function borrarPlantilla(tenantId: string, templateId: string) {
  const pk = `TENANT#${tenantId}`;
  const sk = `TEMPLATE#${templateId}`;

  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk }
  }));

  return true;
}
