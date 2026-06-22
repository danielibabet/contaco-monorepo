import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || "ContaCoTable";

export const handler = async (event: any) => {
  const { TenantId, Ejercicio } = event.arguments;

  try {
    // 1. Obtener todas las subcuentas (Diccionario de descripciones)
    const subcuentasMap: Record<string, string> = {};
    let lastEvaluatedKeySubcuentas = undefined;
    
    do {
      const subcuentasCmd = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `TENANT#${TenantId}`,
          ":skPrefix": "SUBC#",
        },
        ExclusiveStartKey: lastEvaluatedKeySubcuentas,
      });

      // @ts-ignore
      const res: any = await docClient.send(subcuentasCmd);
      res.Items?.forEach((item: any) => {
        const cod = item.SK.replace("SUBC#", "");
        subcuentasMap[cod] = item.Descripcion || "Sin descripción";
      });
      lastEvaluatedKeySubcuentas = res.LastEvaluatedKey;
    } while (lastEvaluatedKeySubcuentas);

    // 2. Obtener todos los apuntes del ejercicio
    let apuntes: any[] = [];
    let lastEvaluatedKeyApuntes = undefined;

    do {
      const apuntesCmd = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `TENANT#${TenantId}#EJER#${Ejercicio}`,
          ":skPrefix": "APUNTE#",
        },
        ExclusiveStartKey: lastEvaluatedKeyApuntes,
      });

      // @ts-ignore
      const res: any = await docClient.send(apuntesCmd);
      if (res.Items) apuntes = apuntes.concat(res.Items);
      lastEvaluatedKeyApuntes = res.LastEvaluatedKey;
    } while (lastEvaluatedKeyApuntes);

    // 3. Agrupación (Memoria)
    const sumas: Record<string, { Debe: number; Haber: number; Nivel: string }> = {};

    const acumular = (codigo: string, debe: number, haber: number, nivel: string) => {
      if (!sumas[codigo]) {
        sumas[codigo] = { Debe: 0, Haber: 0, Nivel: nivel };
      }
      sumas[codigo].Debe += debe;
      sumas[codigo].Haber += haber;
    };

    apuntes.forEach((ap) => {
      const cod = ap.SubcuentaId;
      if (!cod) return;
      const debe = Number(ap.Debe) || 0;
      const haber = Number(ap.Haber) || 0;

      // Acumular Nivel MAX
      acumular(cod, debe, haber, "MAX");

      // Acumular Nivel 3
      if (cod.length >= 3) {
        acumular(cod.substring(0, 3), debe, haber, "3");
      }
      // Acumular Nivel 4
      if (cod.length >= 4) {
        acumular(cod.substring(0, 4), debe, haber, "4");
      }
    });

    // 4. Formatear la salida
    const resultado: any[] = [];

    Object.keys(sumas).forEach((cod) => {
      const s = sumas[cod];
      const saldoDeudor = s.Debe > s.Haber ? s.Debe - s.Haber : 0;
      const saldoAcreedor = s.Haber > s.Debe ? s.Haber - s.Debe : 0;
      
      // Intentar obtener la descripción. Si es un nivel 3 o 4, a veces no existe en subcuentas.
      const descripcion = subcuentasMap[cod] || `Agrupación ${cod}`;

      resultado.push({
        SubcuentaId: cod,
        Descripcion: descripcion,
        SumaDebe: s.Debe,
        SumaHaber: s.Haber,
        SaldoDeudor: saldoDeudor,
        SaldoAcreedor: saldoAcreedor,
        Nivel: s.Nivel,
      });
    });

    // Ordenar por código de cuenta
    resultado.sort((a, b) => a.SubcuentaId.localeCompare(b.SubcuentaId));

    return resultado;
  } catch (error) {
    console.error("Error obteniendo balance:", error);
    throw new Error("No se pudo obtener el Balance de Sumas y Saldos");
  }
};
