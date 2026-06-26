import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
const AdmZip = require('adm-zip');
import { DBFFile } from 'dbffile';
import { pipeline } from 'stream/promises';

const s3Client = new S3Client({});
const docClient = new DynamoDBClient({});

const BUCKET_NAME = process.env.BUCKET_NAME || '';
const TABLE_NAME = process.env.TABLE_NAME || '';

export const handler = async (event: any) => {
    console.log("Event:", JSON.stringify(event, null, 2));
    const { TenantId, Ejercicio, FileKey } = event.arguments;

    if (!TenantId || !Ejercicio || !FileKey) {
        throw new Error("Faltan parámetros requeridos: TenantId, Ejercicio, FileKey");
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contaco-migr-'));
    const zipPath = path.join(tmpDir, 'backup.zip');

    try {
        console.log(`Downloading ${FileKey} from ${BUCKET_NAME}`);
        const getObjCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: FileKey });
        const s3Result = await s3Client.send(getObjCmd);
        
        if (!s3Result.Body) throw new Error("No se pudo leer el cuerpo del archivo S3");
        
        const writeStream = fs.createWriteStream(zipPath);
        // @ts-ignore
        await pipeline(s3Result.Body, writeStream);
        console.log("Archivo descargado a", zipPath);

        // Descomprimir el archivo
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tmpDir, true);
        console.log("Archivo ZIP descomprimido en", tmpDir);

        // Buscar Subcta.dbf y Diario.dbf (insensible a mayúsculas)
        const files = fs.readdirSync(tmpDir);
        const subctaFile = files.find(f => f.toLowerCase() === 'subcta.dbf');
        const diarioFile = files.find(f => f.toLowerCase() === 'diario.dbf');

        if (!subctaFile || !diarioFile) {
            throw new Error("El archivo subido no parece ser una copia de seguridad válida de ContaPlus (faltan Subcta.dbf o Diario.dbf).");
        }

        // ==========================
        // 1. MIGRAR SUBCUENTAS
        // ==========================
        console.log("Parseando " + subctaFile);
        const dbfSubcta = await DBFFile.open(path.join(tmpDir, subctaFile), { encoding: 'latin1' });
        const subcuentas = await dbfSubcta.readRecords();
        
        console.log(`Leídas ${subcuentas.length} subcuentas. Escribiendo en DynamoDB...`);
        let batch: any[] = [];
        for (const row of subcuentas) {
            const cod = (row.COD || '').toString().trim();
            const titulo = (row.TITULO || '').toString().trim();
            const nif = (row.NIF || '').toString().trim();
            if (!cod) continue;

            batch.push({
                PutRequest: {
                    Item: marshall({
                        PK: TenantId,
                        SK: `SUBC#${cod}`,
                        SubcuentaId: cod,
                        Nombre: titulo,
                        Nif: nif,
                        CreatedAt: new Date().toISOString()
                    })
                }
            });

            if (batch.length === 25) {
                await writeBatch(batch);
                batch = [];
            }
        }
        if (batch.length > 0) await writeBatch(batch);

        // ==========================
        // 2. MIGRAR DIARIO
        // ==========================
        console.log("Parseando " + diarioFile);
        const dbfDiario = await DBFFile.open(path.join(tmpDir, diarioFile), { encoding: 'latin1' });
        const asientos = await dbfDiario.readRecords();
        
        console.log(`Leídas ${asientos.length} líneas de diario. Agrupando por asiento...`);
        // En ContaPlus: ASIENTO (número), FECHA, SUBCUENTA, CONCEPTO, DOCUM, DEBE, HABER, IVA (opcional), BASEIVA
        
        // Agrupar líneas por Número de Asiento + Fecha (para no mezclar asientos del mismo número en distintos días si los hubiera)
        const asientosGrouped = new Map<string, any[]>();
        
        for (const row of asientos) {
            const numAsiento = row.ASIENTO || 0;
            // Fecha puede ser Date o String en yyyymmdd
            let fechaStr = Ejercicio + '-01-01';
            if (row.FECHA) {
                if (row.FECHA instanceof Date) {
                    fechaStr = row.FECHA.toISOString().split('T')[0];
                } else {
                    const f = row.FECHA.toString().trim();
                    if (f.length === 8) {
                        fechaStr = `${f.substring(0,4)}-${f.substring(4,6)}-${f.substring(6,8)}`;
                    }
                }
            }

            // Ignorar apuntes de otros ejercicios si el usuario especificó uno concreto
            if (!fechaStr.startsWith(Ejercicio)) continue;

            const key = `${fechaStr}#${numAsiento}`;
            if (!asientosGrouped.has(key)) {
                asientosGrouped.set(key, []);
            }
            asientosGrouped.get(key)!.push(row);
        }

        console.log(`Escribiendo ${asientosGrouped.size} asientos en DynamoDB...`);
        batch = [];
        
        for (const [key, lineasFox] of asientosGrouped.entries()) {
            const [fechaStr, numAsiento] = key.split('#');
            
            // Convertir las líneas de FoxPro a nuestra estructura
            const lineasNuestras = lineasFox.map(l => ({
                Subcuenta: (l.SUBCUENTA || '').toString().trim(),
                Concepto: (l.CONCEPTO || '').toString().trim(),
                Documento: (l.DOCUM || '').toString().trim(), // Mantenemos documento internamente aunque no se vea
                Debe: parseFloat(l.DEBE || 0) || 0,
                Haber: parseFloat(l.HABER || 0) || 0,
            }));

            // Sumar Debe y Haber para asegurar que el asiento cuadra (opcional, o confiar ciegamente en el DBF)
            batch.push({
                PutRequest: {
                    Item: marshall({
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
                }
            });

            if (batch.length === 25) {
                await writeBatch(batch);
                batch = [];
            }
        }
        if (batch.length > 0) await writeBatch(batch);

        console.log("Migración completada con éxito");
        return true;

    } catch (error) {
        console.error("Error en migración:", error);
        throw error;
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
};

async function writeBatch(batch: any[]) {
    try {
        await docClient.send(new BatchWriteItemCommand({
            RequestItems: {
                [TABLE_NAME]: batch
            }
        }));
    } catch (e) {
        console.error("Error en batch write:", e);
    }
}
