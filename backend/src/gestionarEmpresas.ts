import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("gestionarEmpresas event:", JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;

  try {
    switch (fieldName) {
      case "listarEmpresas":
        return await listarEmpresas();
      case "crearEmpresa":
        return await crearEmpresa(event.arguments.input);
      case "editarEmpresa":
        return await editarEmpresa(event.arguments.input);
      case "borrarEmpresa":
        return await borrarEmpresa(event.arguments.TenantId);
      default:
        throw new Error(`Operación GraphQL desconocida: ${fieldName}`);
    }
  } catch (err: any) {
    console.error("Error en gestionarEmpresas:", err);
    throw new Error(err.message);
  }
};

async function listarEmpresas() {
  const cmd = new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: "SK = :profile",
    ExpressionAttributeValues: {
      ":profile": "PROFILE"
    }
  });

  const res = await docClient.send(cmd);
  
  return (res.Items || []).map(item => ({
    TenantId: item.PK.replace("TENANT#", ""),
    Nombre: item.Nombre || item.Descripcion || "Empresa Sin Nombre",
    RazonSocial: item.RazonSocial || null,
    NIF: item.NIF || null,
    Direccion: item.Direccion || null,
    Poblacion: item.Poblacion || null,
    CodigoPostal: item.CodigoPostal || null
  }));
}

async function crearEmpresa(input: any) {
  const tenantId = randomUUID();
  const pk = `TENANT#${tenantId}`;
  const sk = "PROFILE";

  const empresaItem = {
    PK: pk,
    SK: sk,
    Type: "Empresa",
    Nombre: input.Nombre,
    RazonSocial: input.RazonSocial || null,
    NIF: input.NIF || null,
    Direccion: input.Direccion || null,
    Poblacion: input.Poblacion || null,
    CodigoPostal: input.CodigoPostal || null,
    CreatedAt: new Date().toISOString(),
    UpdatedAt: new Date().toISOString()
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: empresaItem
  }));

  return {
    TenantId: tenantId,
    Nombre: input.Nombre,
    RazonSocial: input.RazonSocial || null,
    NIF: input.NIF || null,
    Direccion: input.Direccion || null,
    Poblacion: input.Poblacion || null,
    CodigoPostal: input.CodigoPostal || null
  };
}

async function editarEmpresa(input: any) {
  const pk = `TENANT#${input.TenantId}`;
  const sk = "PROFILE";

  const empresaItem = {
    PK: pk,
    SK: sk,
    Type: "Empresa",
    Nombre: input.Nombre,
    RazonSocial: input.RazonSocial || null,
    NIF: input.NIF || null,
    Direccion: input.Direccion || null,
    Poblacion: input.Poblacion || null,
    CodigoPostal: input.CodigoPostal || null,
    UpdatedAt: new Date().toISOString()
  };

  // En DynamoDB PutCommand sobrescribe el item si las claves primarias coinciden
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: empresaItem
  }));

  return {
    TenantId: input.TenantId,
    Nombre: input.Nombre,
    RazonSocial: input.RazonSocial || null,
    NIF: input.NIF || null,
    Direccion: input.Direccion || null,
    Poblacion: input.Poblacion || null,
    CodigoPostal: input.CodigoPostal || null
  };
}

async function borrarEmpresa(tenantId: string) {
  const pk = `TENANT#${tenantId}`;
  const sk = "PROFILE";

  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk }
  }));

  return true;
}
