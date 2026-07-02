import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("cronAmortizaciones triggered:", JSON.stringify(event));

  try {
    let lastEvaluatedKey: any = undefined;
    const activosAProcesar: any[] = [];

    // 1. Escanear todos los activos usando el GSI1
    do {
      const cmd = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :gsi1pk",
        FilterExpression: "Estado = :estado",
        ExpressionAttributeValues: {
          ":gsi1pk": "ACTIVO",
          ":estado": "ACTIVO"
        },
        ExclusiveStartKey: lastEvaluatedKey
      });

      const res = await docClient.send(cmd);
      if (res.Items) {
        activosAProcesar.push(...res.Items);
      }
      lastEvaluatedKey = res.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Encontrados ${activosAProcesar.length} activos para amortizar.`);

    // 2. Procesar cada activo
    const nowObj = new Date();
    const now = nowObj.toISOString();
    const fechaAsiento = now.split('T')[0];

    for (const activo of activosAProcesar) {
      // 2.1 Verificar si la vida útil ha concluido
      if (activo.MesesAmortizados >= activo.MesesAmortizacion) {
        console.warn(`El activo ${activo.Id} ya está totalmente amortizado pero seguía en estado ACTIVO.`);
        continue;
      }

      const nuevoMesesAmortizados = activo.MesesAmortizados + 1;
      const nuevoEstado = nuevoMesesAmortizados >= activo.MesesAmortizacion ? "AMORTIZADO" : "ACTIVO";

      // Ajustar cuota si es la última y hay descuadre por redondeos
      let importeAmortizacion = activo.CuotaMensual;
      if (nuevoEstado === "AMORTIZADO") {
        const amortizadoHastaAhora = Math.round((activo.MesesAmortizados * activo.CuotaMensual) * 100) / 100;
        importeAmortizacion = Math.round((activo.ValorAdquisicion - amortizadoHastaAhora) * 100) / 100;
      }

      const idAsiento = randomUUID().substring(0, 8);
      const concepto = `Amortización mensual - ${activo.Nombre}`;

      const pkCabeceraAsiento = `TENANT#${activo.TenantId}#EJER#${activo.Ejercicio}`;
      const skCabeceraAsiento = `ASIENTO#${fechaAsiento}#${idAsiento}`;

      const transactItems: any[] = [];

      // 2.2 Actualizar el Activo
      transactItems.push({
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: activo.PK, SK: activo.SK },
          UpdateExpression: "SET MesesAmortizados = :meses, Estado = :estado, UpdatedAt = :now",
          ConditionExpression: "MesesAmortizados = :v_meses", // Control de concurrencia optimista
          ExpressionAttributeValues: {
            ":meses": nuevoMesesAmortizados,
            ":estado": nuevoEstado,
            ":now": now,
            ":v_meses": activo.MesesAmortizados
          }
        }
      });

      // 2.3 Crear Cabecera del Asiento
      transactItems.push({
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: pkCabeceraAsiento,
            SK: skCabeceraAsiento,
            Type: 'Asiento',
            IdAsiento: idAsiento,
            Fecha: fechaAsiento,
            Observaciones: concepto,
            Usuario: 'CRON_SYSTEM',
            Estado: 'Cuadrado',
            CreatedAt: now
          }
        }
      });

      // 2.4 Apuntes del Asiento (Debe a Gastos 681, Haber a Amortización Acumulada 281)
      const apuntes = [
        { SubcuentaId: '6810000', Concepto: concepto, Debe: importeAmortizacion, Haber: 0 },
        { SubcuentaId: '2810000', Concepto: concepto, Debe: 0, Haber: importeAmortizacion }
      ];

      apuntes.forEach((apunte, index) => {
        const linea = (index + 1).toString().padStart(4, '0');
        transactItems.push({
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: pkCabeceraAsiento,
              SK: `APUNTE#${idAsiento}#${linea}`,
              Type: 'Apunte',
              IdAsiento: idAsiento,
              Linea: linea,
              Fecha: fechaAsiento,
              SubcuentaId: apunte.SubcuentaId,
              Concepto: apunte.Concepto,
              Documento: `AMORT-${activo.Id}`,
              Debe: apunte.Debe,
              Haber: apunte.Haber,
              GSI1PK: `TENANT#${activo.TenantId}#EJER#${activo.Ejercicio}#SUBC#${apunte.SubcuentaId}`,
              GSI1SK: `FECHA#${fechaAsiento}#APUNTE#${idAsiento}#${linea}`
            }
          }
        });
      });

      try {
        // Ejecutar Transacción por cada activo (las transacciones en DDB tienen un límite de 100 items, aquí enviamos 4)
        await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
        console.log(`Amortizado activo ${activo.Id} exitosamente. Estado: ${nuevoEstado}`);
      } catch (e: any) {
        console.error(`Error procesando amortización del activo ${activo.Id}:`, e);
      }
    }

    return { status: "OK", processed: activosAProcesar.length };
  } catch (err: any) {
    console.error("Error en cronAmortizaciones:", err);
    throw new Error(err.message);
  }
};
