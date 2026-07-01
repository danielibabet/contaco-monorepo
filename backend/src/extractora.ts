import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { marshall } from '@aws-sdk/util-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { S3Event } from 'aws-lambda';
const AdmZip = require('adm-zip');
import { DBFFile } from 'dbffile';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({});
const sqsClient = new SQSClient({});

const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';

export const handler = async (event: S3Event) => {
    console.log("ExtractoraZip event:", JSON.stringify(event, null, 2));

    const record = event.Records[0];
    const bucketName = record.s3.bucket.name;
    const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    
    // Asumimos ruta: migraciones/{TenantId}/{Ejercicio}/backup.zip
    const parts = objectKey.split('/');
    if (parts.length < 4 || parts[0] !== 'migraciones') {
        console.warn("El objeto subido no sigue el patrón migraciones/{TenantId}/{Ejercicio}/archivo.zip");
        return;
    }
    const TenantId = parts[1];
    const Ejercicio = parts[2];

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contaco-migr-'));
    const zipPath = path.join(tmpDir, 'backup.zip');

    try {
        console.log(`Downloading ${objectKey} from ${bucketName}`);
        const getObjCmd = new GetObjectCommand({ Bucket: bucketName, Key: objectKey });
        const s3Result = await s3Client.send(getObjCmd);
        
        if (!s3Result.Body) throw new Error("No se pudo leer el cuerpo del archivo S3");
        
        const writeStream = fs.createWriteStream(zipPath);
        // @ts-ignore
        await pipeline(s3Result.Body, writeStream);
        console.log("Archivo descargado a", zipPath);

        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tmpDir, true);

        const files = fs.readdirSync(tmpDir);
        const subctaFile = files.find(f => f.toLowerCase() === 'subcta.dbf');
        const diarioFile = files.find(f => f.toLowerCase() === 'diario.dbf');

        if (!subctaFile || !diarioFile) {
            throw new Error("Faltan Subcta.dbf o Diario.dbf");
        }

        // 1. MIGRAR SUBCUENTAS
        console.log("Parseando " + subctaFile);
        const dbfSubcta = await DBFFile.open(path.join(tmpDir, subctaFile), { encoding: 'latin1' });
        const subcuentas = await dbfSubcta.readRecords();
        
        let batch: any[] = [];
        for (const row of subcuentas) {
            const cod = (row.COD || '').toString().trim();
            const titulo = (row.TITULO || '').toString().trim();
            const nif = (row.NIF || '').toString().trim();
            if (!cod) continue;

            batch.push({
                Id: uuidv4(),
                MessageBody: JSON.stringify({
                    PK: TenantId,
                    SK: `SUBC#${cod}`,
                    SubcuentaId: cod,
                    Nombre: titulo,
                    Nif: nif,
                    CreatedAt: new Date().toISOString()
                })
            });

            if (batch.length === 10) { // Límite SQS Batch = 10
                await sendToSQS(batch);
                batch = [];
            }
        }
        if (batch.length > 0) await sendToSQS(batch);

        // 2. MIGRAR DIARIO
        console.log("Parseando " + diarioFile);
        const dbfDiario = await DBFFile.open(path.join(tmpDir, diarioFile), { encoding: 'latin1' });
        const asientos = await dbfDiario.readRecords();
        
        const asientosGrouped = new Map<string, any[]>();
        
        for (const row of asientos) {
            const numAsiento = row.ASIENTO || 0;
            let fechaStr = Ejercicio + '-01-01';
            if (row.FECHA) {
                if (row.FECHA instanceof Date) {
                    fechaStr = row.FECHA.toISOString().split('T')[0];
                } else {
                    const f = row.FECHA.toString().trim();
                    if (f.length === 8) fechaStr = `${f.substring(0,4)}-${f.substring(4,6)}-${f.substring(6,8)}`;
                }
            }
            if (!fechaStr.startsWith(Ejercicio)) continue;

            const key = `${fechaStr}#${numAsiento}`;
            if (!asientosGrouped.has(key)) asientosGrouped.set(key, []);
            asientosGrouped.get(key)!.push(row);
        }

        batch = [];
        for (const [key, lineasFox] of asientosGrouped.entries()) {
            const [fechaStr, numAsiento] = key.split('#');
            const lineasNuestras = lineasFox.map(l => ({
                Subcuenta: (l.SUBCUENTA || '').toString().trim(),
                Concepto: (l.CONCEPTO || '').toString().trim(),
                Documento: (l.DOCUM || '').toString().trim(),
                Debe: parseFloat(l.DEBE || 0) || 0,
                Haber: parseFloat(l.HABER || 0) || 0,
            }));

            batch.push({
                Id: uuidv4(),
                MessageBody: JSON.stringify({
                    PK: TenantId,
                    SK: `ASIENTO#${fechaStr}#${String(numAsiento).padStart(6, '0')}`,
                    TenantId: TenantId,
                    Ejercicio: Ejercicio,
                    Numero: parseInt(numAsiento),
                    Fecha: fechaStr,
                    Lineas: lineasNuestras,
                    Estado: 'ACTIVO',
                    CreatedAt: new Date().toISOString(),
                    UpdatedAt: new Date().toISOString()
                })
            });

            if (batch.length === 10) {
                await sendToSQS(batch);
                batch = [];
            }
        }
        if (batch.length > 0) await sendToSQS(batch);

        console.log("Extracción y envío a SQS completado");
    } catch (error) {
        console.error("Error en extracción:", error);
        throw error;
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
};

async function sendToSQS(entries: any[]) {
    try {
        await sqsClient.send(new SendMessageBatchCommand({
            QueueUrl: SQS_QUEUE_URL,
            Entries: entries
        }));
    } catch (e) {
        console.error("Error en SQS send:", e);
        throw e;
    }
}
