import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

const s3Client = new S3Client({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const BUCKET_NAME = process.env.BUCKET_NAME || "";
const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("generarUrlSubida event:", JSON.stringify(event, null, 2));

  const { TenantId, Ejercicio, IdAsiento, NombreArchivo } = event.arguments;

  // 1. Generar S3 Key Jerárquico Seguro
  const s3Key = `${TenantId}/${Ejercicio}/${IdAsiento}/${uuidv4()}-${NombreArchivo}`;

  // 2. Crear URL Presigned para subida (PUT)
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: "application/pdf", // Forzamos PDF por ahora
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 minutos

  // 3. Actualizar el Asiento en DynamoDB para anexar el documento
  const docAdjunto = { S3Key: s3Key, Nombre: NombreArchivo };
  
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { 
      PK: `TENANT#${TenantId}`,
      SK: `ASIENTO#${Ejercicio}#${IdAsiento}` 
    },
    // list_append requiere que el atributo exista o manejamos su creación si no existe. 
    // Usamos un pequeño truco con if_not_exists
    UpdateExpression: "SET Documentos = list_append(if_not_exists(Documentos, :emptyList), :newDoc)",
    ExpressionAttributeValues: {
      ":emptyList": [],
      ":newDoc": [docAdjunto]
    }
  }));

  return { Url: url, S3Key: s3Key };
};
