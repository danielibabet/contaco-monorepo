import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("listarEmpresas event:", JSON.stringify(event, null, 2));

  try {
    const cmd = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "SK = :profile",
      ExpressionAttributeValues: {
        ":profile": "PROFILE"
      }
    });

    const res = await docClient.send(cmd);
    
    // Si no hay tenants, devolvemos uno mockeado por defecto para que la app no rompa
    if (!res.Items || res.Items.length === 0) {
        return [
            { TenantId: "empresa-demo-01", Nombre: "Empresa Demo S.L." },
            { TenantId: "contaco-02", Nombre: "ContaCo Corp" }
        ];
    }

    return res.Items.map(item => ({
      TenantId: item.PK.replace("TENANT#", ""),
      Nombre: item.Nombre || item.Descripcion || "Empresa Sin Nombre"
    }));
    
  } catch (err: any) {
    console.error("Error listarEmpresas:", err);
    throw new Error(`No se pudieron obtener las empresas: ${err.message}`);
  }
};
