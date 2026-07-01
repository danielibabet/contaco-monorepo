# Arquitectura Avanzada: ContaCo V3.0 (SaaS Serverless)

Este documento detalla la arquitectura, el esquema GraphQL y el código CDK/Node.js para implementar la importación masiva de ContaPlus, OCR de coste cero, conciliación automática y contabilidad analítica, manteniendo una infraestructura **100% Serverless** optimizada para el *Free Tier* de AWS.

## ÉPICA 1: Importador Masivo de ContaPlus

La subida usa *Presigned URLs*. Al caer el `.zip` en un bucket S3, un evento dispara una Lambda Extractora que lee el ZIP en *stream*, parsea los DBF y envía lotes de registros a una cola SQS. Una Lambda *Worker* consume la cola e inserta en DynamoDB de forma controlada.

### infraestructura/lib/epic1-importador-stack.ts (CDK)
```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

export class ImportadorStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Cola SQS para ingestión controlada (Dead Letter Queue incluida por seguridad)
    const dlq = new sqs.Queue(this, 'ImportadorDLQ');
    const batchWriteQueue = new sqs.Queue(this, 'BatchWriteQueue', {
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 }
    });

    // 2. Lambda Extractora (Descomprime y lee DBFs)
    const extractoraLambda = new lambda.Function(this, 'ExtractoraZipLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'extractora.handler',
      code: lambda.Code.fromAsset('backend/dist'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
      environment: { SQS_QUEUE_URL: batchWriteQueue.queueUrl }
    });
    batchWriteQueue.grantSendMessages(extractoraLambda);

    // 3. Bucket de Migraciones y Trigger
    const bucket = new s3.Bucket(this, 'ContaCoMigrationsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{ expiration: cdk.Duration.days(1) }]
    });
    bucket.grantRead(extractoraLambda);
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(extractoraLambda));

    // 4. Lambda Worker (Inserta en DDB vía SQS)
    const dbfWriterLambda = new lambda.Function(this, 'DBFWriterLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'writer.handler',
      code: lambda.Code.fromAsset('backend/dist'),
      timeout: cdk.Duration.seconds(30),
    });
    dbfWriterLambda.addEventSource(new lambdaEventSources.SqsEventSource(batchWriteQueue, {
      batchSize: 25 
    }));
  }
}
```

### backend/src/writer.ts (Lógica de Reintentos e Inserción)
```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { SQSEvent } from "aws-lambda";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const handler = async (event: SQSEvent) => {
    const putRequests = event.Records.map(record => {
        const payload = JSON.parse(record.body);
        return { PutRequest: { Item: payload } };
    });

    let requestItems = { [process.env.TABLE_NAME!]: putRequests };
    let retries = 0;
    const maxRetries = 3;

    while (Object.keys(requestItems).length > 0 && retries < maxRetries) {
        const command = new BatchWriteCommand({ RequestItems: requestItems });
        const response = await docClient.send(command);

        if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
            requestItems = response.UnprocessedItems as any;
            retries++;
            const backoff = Math.pow(2, retries) * 100;
            console.warn(`Unprocessed items detectados. Reintentando en ${backoff}ms...`);
            await sleep(backoff);
        } else {
            requestItems = {};
        }
    }

    if (Object.keys(requestItems).length > 0) {
        throw new Error("BatchWrite falló después de múltiples reintentos.");
    }
};
```

---

## ÉPICA 2: Funcionalidades Modernas (Coste Cero)

### 1. OCR de Facturas 100% Gratis con Tesseract Dockerizado

#### backend/ocr.Dockerfile
```dockerfile
FROM public.ecr.aws/lambda/nodejs:18
RUN yum update -y && \
    yum install -y tesseract tesseract-langpack-spa && \
    yum clean all
COPY package*.json ./
RUN npm install
COPY dist/ocrHandler.js ./
CMD ["ocrHandler.handler"]
```

#### backend/src/ocrHandler.ts (Lógica de Extracción)
```typescript
import tesseract from "node-tesseract-ocr";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export const handler = async (event: any) => {
    const { S3Key } = event.arguments; 
    // Bajar imagen a /tmp, lógica resumida...
    
    const text = await tesseract.recognize('/tmp/img.png', { lang: "spa" });

    const nifMatch = text.match(/[A-Z0-9]{9}/i);
    const importeMatch = text.match(/(?:TOTAL|IMPORTE|A PAGAR)[\s:]*([\d,.]+)/i);
    const baseMatch = text.match(/(?:BASE|BI|SUBTOTAL)[\s:]*([\d,.]+)/i);

    return {
        NIF: nifMatch ? nifMatch[0] : null,
        Total: importeMatch ? parseFloat(importeMatch[1].replace(',','.')) : null,
        Base: baseMatch ? parseFloat(baseMatch[1].replace(',','.')) : null,
        TextoCompleto: text
    };
};
```

### 2. Contabilidad Analítica (Single-Table Design)

#### infrastructure/graphql/schema.graphql
```graphql
type CentroCosteDistribucion {
  CodigoProyecto: String!
  Porcentaje: Float!
  ImporteAsignado: Float!
}

type Apunte {
  DistribucionAnalitica: [CentroCosteDistribucion!]
}

input CentroCosteInput {
  CodigoProyecto: String!
  Porcentaje: Float!
}
```

### 3. Conciliación Bancaria Automática (Motor)

#### backend/src/motorConciliacion.ts
```typescript
interface ApunteDiario { id: string; fecha: Date; importe: number; }
interface MovimientoBanco { id: string; fecha: Date; importe: number; }
interface MatchResult { idApunte: string; idBanco: string; fiabilidad: 'EXACTO' | 'SUGERIDO'; }

export const ejecutarAutoMatch = (apuntes: ApunteDiario[], banco: MovimientoBanco[]): MatchResult[] => {
    const matches: MatchResult[] = [];
    const bancoRestante = [...banco];
    const MARGEN_DIAS = 3 * 24 * 60 * 60 * 1000;

    apuntes.forEach(apunte => {
        let matchIdx = bancoRestante.findIndex(b => 
            b.importe === apunte.importe && b.fecha.getTime() === apunte.fecha.getTime()
        );

        if (matchIdx !== -1) {
            matches.push({ idApunte: apunte.id, idBanco: bancoRestante[matchIdx].id, fiabilidad: 'EXACTO' });
            bancoRestante.splice(matchIdx, 1);
            return;
        }

        matchIdx = bancoRestante.findIndex(b => 
            b.importe === apunte.importe && 
            Math.abs(b.fecha.getTime() - apunte.fecha.getTime()) <= MARGEN_DIAS
        );

        if (matchIdx !== -1) {
            matches.push({ idApunte: apunte.id, idBanco: bancoRestante[matchIdx].id, fiabilidad: 'SUGERIDO' });
            bancoRestante.splice(matchIdx, 1);
        }
    });

    return matches;
};
```
