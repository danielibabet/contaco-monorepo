import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("alternarPunteo event:", JSON.stringify(event, null, 2));

  const { TenantId, Ejercicio, IdAsiento, Linea, Estado } = event.arguments;

  const pk = `TENANT#${TenantId}`;
  const sk = `APUNTE#${Ejercicio}#${IdAsiento}#${Linea}`;

  try {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
      UpdateExpression: "SET Punteado = :estado",
      ExpressionAttributeValues: {
        ":estado": Estado
      }
    }));

    return true;
  } catch (err: any) {
    console.error("Error en alternarPunteo:", err);
    throw new Error(err.message);
  }
};
