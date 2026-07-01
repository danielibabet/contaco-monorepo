# Plan de Integración: ContaCo V3.0

Vamos a integrar la hoja de ruta paso a paso en el código fuente real del proyecto.

## Pregunta Abierta (Requiere Respuesta)

**Cambios en `migrarContaPlus.ts` (S3 Trigger)**
Al pasar `migrarContaPlus` de ser una Mutación GraphQL a un Evento S3, la función ya no recibe `TenantId` ni `Ejercicio` como parámetros directos de AppSync. 
Para solucionar esto, propongo que cuando el cliente suba el archivo `.zip`, lo haga a una ruta estructurada en el bucket. Por ejemplo: `migraciones/{TenantId}/{Ejercicio}/backup.zip`. La Lambda extraerá las variables directamente del `FileKey` de S3. **¿Te parece bien esta convención de nombres para mantener la segregación Multi-Tenant en S3?**

---

## Cambios Propuestos

### 1. Actualización del Stack de Infraestructura (`infrastructure/lib/infrastructure-stack.ts`)
- Añadir las colas SQS `ImportadorDLQ` y `BatchWriteQueue`.
- Renombrar `migrarContaPlusLambda` a `extractoraLambda`, apuntando a `extractora.handler` y añadir el trigger de S3 (`s3n.LambdaDestination`).
- Eliminar el *resolver* `migrarContaPlus` de GraphQL ya que ahora es asíncrono.
- Añadir `dbfWriterLambda` apuntando a `writer.handler` con *SqsEventSource*.
- Añadir `ocrLambda` como `lambda.DockerImageFunction` apuntando al `ocr.Dockerfile`.

### 2. División del Importador Masivo
- **Nuevo `backend/src/extractora.ts`**: Sustituye a `migrarContaPlus.ts`. Invocada por S3, descarga el ZIP, extrae con `adm-zip`, parsea con `dbffile` y envía mensajes a SQS (`BatchWriteQueue`) en lotes de 25.
- **Nuevo `backend/src/writer.ts`**: Invocada por SQS. Usa `DynamoDBDocumentClient` y `BatchWriteCommand` implementando *Exponential Backoff*.
- Eliminar el archivo antiguo `backend/src/migrarContaPlus.ts`.

### 3. OCR en Docker
- **Nuevo `backend/ocr.Dockerfile`**: Imagen base `lambda/nodejs:18` con `tesseract` instalado.
- **Nuevo `backend/src/ocrHandler.ts`**: Lee la imagen desde S3, ejecuta Tesseract localmente, extrae NIF/Total/Base mediante Expresiones Regulares.

### 4. Actualización GraphQL y Conciliación
- **`infrastructure/graphql/schema.graphql`**: Añadir `CentroCosteInput` y `CentroCosteDistribucion`. Inyectar `DistribucionAnalitica` en `Apunte`. Modificar `MovimientoBancario` para incluir datos de sugerencias de punteo.
- **`backend/src/procesarFicheroBanco.ts`**: Al final del parseo de la Norma 43, inyectar una llamada interna a DynamoDB para obtener apuntes no punteados de la cuenta `572*`. Ejecutar el motor de *Auto-Match* y devolver la respuesta ampliada.
