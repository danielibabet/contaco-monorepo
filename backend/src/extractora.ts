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
import crypto from 'crypto';

const s3Client = new S3Client({});
const sqsClient = new SQSClient({});

function findFileIgnoreCase(dir: string, filename: string): string | null {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        if (item.isDirectory()) {
            const found = findFileIgnoreCase(path.join(dir, item.name), filename);
            if (found) return found;
        } else {
            if (item.name.toLowerCase() === filename.toLowerCase()) {
                return path.join(dir, item.name);
            }
        }
    }
    return null;
}

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

        const subctaFilePath = findFileIgnoreCase(tmpDir, 'subcta.dbf');
        const diarioFilePath = findFileIgnoreCase(tmpDir, 'diario.dbf');

        if (!subctaFilePath || !diarioFilePath) {
            throw new Error("Faltan Subcta.dbf o Diario.dbf en el archivo ZIP");
        }

        // 1. MIGRAR SUBCUENTAS
        console.log("Parseando " + subctaFilePath);
        const dbfSubcta = await DBFFile.open(subctaFilePath, { encoding: 'latin1' });
        const subcuentas = await dbfSubcta.readRecords();
        
        let batch: any[] = [];
        for (const row of subcuentas) {
            const cod = (row.COD || '').toString().trim();
            const titulo = (row.TITULO || '').toString().trim();
            const nif = (row.NIF || '').toString().trim();
            if (!cod) continue;

            batch.push({
                Id: crypto.randomUUID(),
                MessageBody: JSON.stringify({
                    PK: `TENANT#${TenantId}`,
                    SK: `SUBC#${cod}`,
                    Type: 'Subcuenta',
                    CodSubcuenta: cod,
                    Descripcion: titulo,
                    NIF: nif,
                    CreatedAt: new Date().toISOString(),
                    GSI1PK: `TENANT#${TenantId}#SUBCUENTAS`,
                    GSI1SK: `SUBC#${cod}`
                })
            });

            if (batch.length === 10) { // Límite SQS Batch = 10
                await sendToSQS(batch);
                batch = [];
            }
        }
        if (batch.length > 0) await sendToSQS(batch);

        // 2. MIGRAR DIARIO
        console.log("Parseando " + diarioFilePath);
        const dbfDiario = await DBFFile.open(diarioFilePath, { encoding: 'latin1' });
        const asientos = await dbfDiario.readRecords();
        
        const asientosGrouped = new Map<string, any[]>();
        
        for (const row of asientos) {
            const numAsiento = row.ASIEN || row.ASIENTO || 0;
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

            // Agrupar solo por numAsiento, para evitar separar un mismo asiento si tiene líneas con fechas ligeramente distintas
            const key = `${numAsiento}`;
            if (!asientosGrouped.has(key)) asientosGrouped.set(key, []);
            asientosGrouped.get(key)!.push(row);
        }

        batch = [];
        for (const [numAsientoStr, lineasFox] of asientosGrouped.entries()) {
            // Heredamos la fecha del asiento de su primera línea
            let fechaStr = Ejercicio + '-01-01';
            const firstRow = lineasFox[0];
            if (firstRow.FECHA) {
                if (firstRow.FECHA instanceof Date) {
                    fechaStr = firstRow.FECHA.toISOString().split('T')[0];
                } else {
                    const f = firstRow.FECHA.toString().trim();
                    if (f.length === 8) fechaStr = `${f.substring(0,4)}-${f.substring(4,6)}-${f.substring(6,8)}`;
                }
            }
            
            const idAsiento = String(numAsientoStr).padStart(6, '0');
            const pkCabecera = `TENANT#${TenantId}#EJER#${Ejercicio}`;
            const skCabecera = `ASIENTO#${fechaStr}#${idAsiento}`;
            const now = new Date().toISOString();

            // Mensaje de Cabecera
            batch.push({
                Id: crypto.randomUUID(),
                MessageBody: JSON.stringify({
                    PK: pkCabecera,
                    SK: skCabecera,
                    Type: 'Asiento',
                    IdAsiento: idAsiento,
                    Fecha: fechaStr,
                    Observaciones: 'Migración ContaPlus',
                    Usuario: 'sistema',
                    Estado: 'Cuadrado',
                    CreatedAt: now
                })
            });

            if (batch.length >= 10) {
                await sendToSQS(batch);
                batch = [];
            }

            // Mensajes de Apuntes
            for (let index = 0; index < lineasFox.length; index++) {
                const l = lineasFox[index];
                const linea = (index + 1).toString().padStart(4, '0');
                const subcuenta = (l.SUBCTA || l.SUBCUENTA || '').toString().trim();
                
                batch.push({
                    Id: crypto.randomUUID(),
                    MessageBody: JSON.stringify({
                        PK: pkCabecera,
                        SK: `APUNTE#${idAsiento}#${linea}`,
                        Type: 'Apunte',
                        IdAsiento: idAsiento,
                        Linea: linea,
                        Fecha: fechaStr,
                        SubcuentaId: subcuenta,
                        Concepto: (l.CONCEPTO || '').toString().trim(),
                        Documento: (l.DOCUMENTO || l.DOCUM || '').toString().trim(),
                        Debe: parseFloat(l.EURODEBE || l.PTADEBE || l.DEBE || 0) || 0,
                        Haber: parseFloat(l.EUROHABER || l.PTAHABER || l.HABER || 0) || 0,
                        GSI1PK: `TENANT#${TenantId}#EJER#${Ejercicio}#SUBC#${subcuenta}`,
                        GSI1SK: `FECHA#${fechaStr}#APUNTE#${idAsiento}#${linea}`
                    })
                });

                if (batch.length >= 10) {
                    await sendToSQS(batch);
                    batch = [];
                }
            }

            if (batch.length >= 10) {
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
