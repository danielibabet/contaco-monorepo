import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';

// @ts-ignore
import tesseract from "node-tesseract-ocr";

const s3Client = new S3Client({});

export const handler = async (event: any) => {
    console.log("OCR Event:", JSON.stringify(event, null, 2));

    const { S3Key } = event.arguments; 
    const BUCKET_NAME = process.env.BUCKET_NAME || '';

    if (!S3Key || !BUCKET_NAME) {
        throw new Error("S3Key y BUCKET_NAME son obligatorios");
    }

    const tmpFilePath = path.join('/tmp', `factura-${Date.now()}.png`);

    try {
        // 1. Descargar imagen de S3 a /tmp
        console.log(`Descargando ${S3Key} de S3...`);
        const getObjCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: S3Key });
        const s3Result = await s3Client.send(getObjCmd);
        
        if (!s3Result.Body) throw new Error("No se pudo leer el cuerpo del archivo S3");
        
        const writeStream = fs.createWriteStream(tmpFilePath);
        // @ts-ignore
        await pipeline(s3Result.Body, writeStream);
        
        console.log("Imagen descargada en", tmpFilePath);

        // 2. Extraer Texto con Tesseract
        console.log("Ejecutando Tesseract OCR...");
        const text = await tesseract.recognize(tmpFilePath, { lang: "spa" });
        console.log("Texto extraído:", text.substring(0, 200) + "...");

        // 3. Parseo RegEx
        const nifMatch = text.match(/[A-Z0-9]{9}/i);
        const importeMatch = text.match(/(?:TOTAL|IMPORTE|A PAGAR)[\s:]*([\d,.]+)/i);
        const baseMatch = text.match(/(?:BASE|BI|SUBTOTAL)[\s:]*([\d,.]+)/i);

        return {
            NIF: nifMatch ? nifMatch[0] : null,
            Total: importeMatch ? parseFloat(importeMatch[1].replace(',','.')) : null,
            Base: baseMatch ? parseFloat(baseMatch[1].replace(',','.')) : null,
            TextoCompleto: text
        };

    } catch (error) {
        console.error("Error en OCR:", error);
        throw new Error("No se pudo procesar la imagen con OCR.");
    } finally {
        // Limpiar /tmp
        if (fs.existsSync(tmpFilePath)) {
            fs.unlinkSync(tmpFilePath);
        }
    }
};
