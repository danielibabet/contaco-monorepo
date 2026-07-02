import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, GetCommand, TransactWriteCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("gestionarEmpresas event:", JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const sub = event.identity?.claims?.sub;

  if (!sub) {
    throw new Error("Usuario no autenticado");
  }

  try {
    switch (fieldName) {
      case "listarEmpresas":
        return await listarEmpresas(sub);
      case "crearEmpresa":
        return await crearEmpresa(sub, event.arguments.input);
      case "editarEmpresa":
        return await editarEmpresa(sub, event.arguments.input);
      case "borrarEmpresa":
        return await borrarEmpresa(sub, event.arguments.TenantId);
      default:
        throw new Error(`Operación GraphQL desconocida: ${fieldName}`);
    }
  } catch (err: any) {
    console.error("Error en gestionarEmpresas:", err);
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
    throw new Error("No autorizado para acceder a esta empresa");
  }
}

async function listarEmpresas(sub: string) {
  const cmd = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `USER#${sub}`,
      ":skPrefix": "TENANT#"
    }
  });

  const res = await docClient.send(cmd);
  
  if (!res.Items || res.Items.length === 0) {
    return [];
  }

  const tenantRecords = res.Items;
  const keys = tenantRecords.map(item => ({ PK: item.SK, SK: "PROFILE" }));
  
  // Dividir en chunks de 100 si hubiese más
  const chunkedKeys = keys.slice(0, 100); 

  const batchReq = new BatchGetCommand({
    RequestItems: {
      [TABLE_NAME]: {
        Keys: chunkedKeys
      }
    }
  });

  const batchRes = await docClient.send(batchReq);
  const profiles = batchRes.Responses?.[TABLE_NAME] || [];

  return profiles.map((item: any) => {
    // Buscar la vinculación original para obtener el Rol
    const userTenant = tenantRecords.find(ur => ur.SK === item.PK);
    return {
      TenantId: item.PK.replace("TENANT#", ""),
      Nombre: item.Nombre || item.Descripcion || "Empresa Sin Nombre",
      RazonSocial: item.RazonSocial || null,
      NIF: item.NIF || null,
      Direccion: item.Direccion || null,
      Poblacion: item.Poblacion || null,
      CodigoPostal: item.CodigoPostal || null,
      Rol: userTenant?.Rol || "EMPLEADO"
    };
  });
}

async function crearEmpresa(sub: string, input: any) {
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

  const userTenantItem = {
    PK: `USER#${sub}`,
    SK: `TENANT#${tenantId}`,
    Type: "UserTenant",
    Rol: "ADMIN",
    CreatedAt: new Date().toISOString()
  };

  await docClient.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: empresaItem
        }
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: userTenantItem
        }
      }
    ]
  }));

  return {
    TenantId: tenantId,
    Nombre: input.Nombre,
    RazonSocial: input.RazonSocial || null,
    NIF: input.NIF || null,
    Direccion: input.Direccion || null,
    Poblacion: input.Poblacion || null,
    CodigoPostal: input.CodigoPostal || null,
    Rol: "ADMIN"
  };
}

async function editarEmpresa(sub: string, input: any) {
  await verificarAccesoTenant(sub, input.TenantId);

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

async function borrarEmpresa(sub: string, tenantId: string) {
  await verificarAccesoTenant(sub, tenantId);

  const pk = `TENANT#${tenantId}`;
  const sk = "PROFILE";

  // Borramos el perfil de la empresa y la vinculación de acceso del usuario
  await docClient.send(new TransactWriteCommand({
    TransactItems: [
      {
        Delete: {
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: sk }
        }
      },
      {
        Delete: {
          TableName: TABLE_NAME,
          Key: { PK: `USER#${sub}`, SK: `TENANT#${tenantId}` }
        }
      }
    ]
  }));

  return true;
}
