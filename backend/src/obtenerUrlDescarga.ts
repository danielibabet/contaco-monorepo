import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME || "";

export const handler = async (event: any) => {
  console.log("obtenerUrlDescarga event:", JSON.stringify(event, null, 2));

  const { S3Key } = event.arguments;

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: S3Key
  });

  // URL válida solo por 15 minutos
  const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });

  return url;
};
