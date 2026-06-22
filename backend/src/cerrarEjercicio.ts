import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || "ContaCoTable";

export const handler = async (event: any) => {
  const { TenantId, EjercicioActual, EjercicioNuevo } = event.arguments;

  try {
    console.log(`Iniciando cierre de ejercicio ${EjercicioActual} a ${EjercicioNuevo} para ${TenantId}`);
    
    // 1. Obtener todos los apuntes del ejercicio actual
    let apuntes: any[] = [];
    let lastEvaluatedKeyApuntes = undefined;

    do {
      const apuntesCmd = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `TENANT#${TenantId}#EJER#${EjercicioActual}`,
          ":skPrefix": "APUNTE#",
        },
        ExclusiveStartKey: lastEvaluatedKeyApuntes,
      });

      // @ts-ignore
      const res: any = await docClient.send(apuntesCmd);
      if (res.Items) apuntes = apuntes.concat(res.Items);
      lastEvaluatedKeyApuntes = res.LastEvaluatedKey;
    } while (lastEvaluatedKeyApuntes);

    // 2. Agrupar saldos por subcuenta
    const saldos: Record<string, { Debe: number; Haber: number; Saldo: number }> = {};
    
    apuntes.forEach((ap) => {
      const cod = ap.SubcuentaId;
      if (!cod) return;
      if (!saldos[cod]) {
        saldos[cod] = { Debe: 0, Haber: 0, Saldo: 0 };
      }
      saldos[cod].Debe += Number(ap.Debe) || 0;
      saldos[cod].Haber += Number(ap.Haber) || 0;
    });

    Object.keys(saldos).forEach(cod => {
      saldos[cod].Saldo = saldos[cod].Debe - saldos[cod].Haber; // Saldo deudor positivo, acreedor negativo
    });

    const operacionesBatch: any[] = [];
    const aniadirOperacion = (item: any) => {
      operacionesBatch.push({ PutRequest: { Item: item } });
    };

    // Helper para generar cabecera de Asiento
    const crearCabeceraAsiento = (ejercicio: string, idAsiento: string, fecha: string, obs: string) => {
      aniadirOperacion({
        PK: `TENANT#${TenantId}#EJER#${ejercicio}`,
        SK: `ASIENTO#${idAsiento}`,
        IdAsiento: idAsiento,
        Fecha: fecha,
        Observaciones: obs,
        Usuario: "SISTEMA",
        Estado: "CERRADO",
        CreatedAt: new Date().toISOString()
      });
    };

    // Helper para generar Apuntes
    const crearApunte = (ejercicio: string, idAsiento: string, linea: number, fecha: string, cod: string, concepto: string, debe: number, haber: number) => {
      const apunteItem = {
        PK: `TENANT#${TenantId}#EJER#${ejercicio}`,
        SK: `APUNTE#${idAsiento}#${linea.toString().padStart(4, '0')}`,
        GSI1PK: `TENANT#${TenantId}#EJER#${ejercicio}#SUBC#${cod}`,
        GSI1SK: `FECHA#${fecha}#APUNTE#${idAsiento}#${linea.toString().padStart(4, '0')}`,
        IdAsiento: idAsiento,
        Linea: linea.toString(),
        Fecha: fecha,
        SubcuentaId: cod,
        Concepto: concepto,
        Debe: debe,
        Haber: haber
      };
      aniadirOperacion(apunteItem);
    };

    // --- ASIENTO 1: REGULARIZACIÓN (31/12) ---
    const ID_REGULARIZACION = "AST-REGULARIZACION";
    const FECHA_CIERRE = "31/12"; // Se asume año natural en el formato, pero guardaremos solo día/mes si ese era el formato, o "YYYY-12-31" si es ISO. Usaremos "31/12" simplificado como Contaplus.
    crearCabeceraAsiento(EjercicioActual, ID_REGULARIZACION, FECHA_CIERRE, "Asiento de Regularización Automático");

    let lineaReg = 1;
    let resultadoEjercicio = 0; // Se acumulará aquí la dif. de los grupos 6 y 7

    Object.keys(saldos).forEach(cod => {
      if ((cod.startsWith("6") || cod.startsWith("7")) && saldos[cod].Saldo !== 0) {
        const saldo = saldos[cod].Saldo;
        if (saldo > 0) {
          // Saldo Deudor -> Abonar (Haber) para anular
          crearApunte(EjercicioActual, ID_REGULARIZACION, lineaReg++, FECHA_CIERRE, cod, "Regularización", 0, saldo);
          resultadoEjercicio += saldo; // Debe de la 129
        } else {
          // Saldo Acreedor -> Cargar (Debe) para anular
          crearApunte(EjercicioActual, ID_REGULARIZACION, lineaReg++, FECHA_CIERRE, cod, "Regularización", Math.abs(saldo), 0);
          resultadoEjercicio -= Math.abs(saldo); // Haber de la 129
        }
        saldos[cod].Saldo = 0; // Queda saldada
      }
    });

    // Apunte contra la 12900000
    const CTA_RESULTADO = "12900000";
    if (resultadoEjercicio > 0) {
      // Gastos > Ingresos (Pérdidas) -> 129 Debe
      crearApunte(EjercicioActual, ID_REGULARIZACION, lineaReg++, FECHA_CIERRE, CTA_RESULTADO, "Resultado del Ejercicio", resultadoEjercicio, 0);
      if (!saldos[CTA_RESULTADO]) saldos[CTA_RESULTADO] = { Debe: 0, Haber: 0, Saldo: 0 };
      saldos[CTA_RESULTADO].Saldo += resultadoEjercicio;
    } else if (resultadoEjercicio < 0) {
      // Ingresos > Gastos (Beneficios) -> 129 Haber
      crearApunte(EjercicioActual, ID_REGULARIZACION, lineaReg++, FECHA_CIERRE, CTA_RESULTADO, "Resultado del Ejercicio", 0, Math.abs(resultadoEjercicio));
      if (!saldos[CTA_RESULTADO]) saldos[CTA_RESULTADO] = { Debe: 0, Haber: 0, Saldo: 0 };
      saldos[CTA_RESULTADO].Saldo -= Math.abs(resultadoEjercicio);
    }

    // --- ASIENTO 2: CIERRE (31/12) y ASIENTO 3: APERTURA (01/01) ---
    const ID_CIERRE = "AST-CIERRE";
    const ID_APERTURA = "AST-APERTURA";
    const FECHA_APERTURA = "01/01";

    crearCabeceraAsiento(EjercicioActual, ID_CIERRE, FECHA_CIERRE, "Asiento de Cierre Automático");
    crearCabeceraAsiento(EjercicioNuevo, ID_APERTURA, FECHA_APERTURA, "Asiento de Apertura Automático");

    let lineaCierre = 1;
    let lineaApertura = 1;

    Object.keys(saldos).forEach(cod => {
      // Incluir grupos 1 al 5
      if ((cod.startsWith("1") || cod.startsWith("2") || cod.startsWith("3") || cod.startsWith("4") || cod.startsWith("5")) && saldos[cod].Saldo !== 0) {
        const saldo = saldos[cod].Saldo;
        
        if (saldo > 0) {
          // Activo (Saldo Deudor) -> Haber en Cierre / Debe en Apertura
          crearApunte(EjercicioActual, ID_CIERRE, lineaCierre++, FECHA_CIERRE, cod, "Cierre de Ejercicio", 0, saldo);
          crearApunte(EjercicioNuevo, ID_APERTURA, lineaApertura++, FECHA_APERTURA, cod, "Apertura de Ejercicio", saldo, 0);
        } else {
          // Pasivo/Patrimonio (Saldo Acreedor) -> Debe en Cierre / Haber en Apertura
          crearApunte(EjercicioActual, ID_CIERRE, lineaCierre++, FECHA_CIERRE, cod, "Cierre de Ejercicio", Math.abs(saldo), 0);
          crearApunte(EjercicioNuevo, ID_APERTURA, lineaApertura++, FECHA_APERTURA, cod, "Apertura de Ejercicio", 0, Math.abs(saldo));
        }
      }
    });

    // 4. Inyección BatchWriteCommand en DynamoDB (Chunks de 25)
    console.log(`Escribiendo ${operacionesBatch.length} operaciones en DynamoDB...`);
    
    const CHUNK_SIZE = 25;
    for (let i = 0; i < operacionesBatch.length; i += CHUNK_SIZE) {
      const chunk = operacionesBatch.slice(i, i + CHUNK_SIZE);
      const params = {
        RequestItems: {
          [TABLE_NAME]: chunk,
        },
      };
      await docClient.send(new BatchWriteCommand(params));
    }

    console.log("Cierre completado con éxito.");
    return true;

  } catch (error) {
    console.error("Error en cerrarEjercicio:", error);
    throw new Error("Fallo al ejecutar el cierre automático.");
  }
};
