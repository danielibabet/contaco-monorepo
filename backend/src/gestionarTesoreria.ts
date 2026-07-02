import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("gestionarTesoreria event:", JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const sub = event.identity?.claims?.sub;

  if (!sub) {
    throw new Error("Usuario no autenticado");
  }

  try {
    switch (fieldName) {
      case "registrarPagoFactura":
        return await registrarPagoFactura(sub, event.arguments);
      default:
        throw new Error(`Operación GraphQL desconocida: ${fieldName}`);
    }
  } catch (err: any) {
    console.error("Error en gestionarTesoreria:", err);
    throw new Error(err.message);
  }
};

async function verificarAccesoTenant(sub: string, tenantId: string) {
  const cmd = new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${sub}`,
      SK: `TENANT#${tenantId}`
    }
  });
  const res = await docClient.send(cmd);
  if (!res.Item) {
    throw new Error("No autorizado para acceder a este Tenant");
  }
  return res.Item.Rol || "EMPLEADO";
}

async function registrarPagoFactura(sub: string, input: any) {
  const { TenantId, Ejercicio, FacturaId, FechaPago, CuentaBanco } = input;

  const rol = await verificarAccesoTenant(sub, TenantId);
  if (rol !== 'ADMIN') {
    throw new Error("Acceso denegado: Privilegios insuficientes");
  }

  const pkFactura = `TENANT#${TenantId}`;
  const skFactura = `FACTURA#${Ejercicio}#${FacturaId}`;

  // 1. Obtener la Factura
  const getCmd = new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: pkFactura, SK: skFactura }
  });

  const res = await docClient.send(getCmd);
  const factura = res.Item;

  if (!factura) {
    throw new Error("La factura no existe o no pertenece al ejercicio especificado.");
  }

  if (factura.EstadoPago === 'PAGADO') {
    throw new Error(`La factura ${factura.Numero} ya se encuentra pagada.`);
  }

  // 2. Preparar el Asiento Contable
  const idAsiento = randomUUID().substring(0, 8);
  const now = new Date().toISOString();

  const concepto = factura.Tipo === 'Emitida' 
    ? `Cobro Factura ${factura.Numero}` 
    : `Pago Factura ${factura.Numero}`;

  const pkCabeceraAsiento = `TENANT#${TenantId}#EJER#${Ejercicio}`;
  const skCabeceraAsiento = `ASIENTO#${FechaPago}#${idAsiento}`;

  const transactItems: any[] = [];

  // 3. Update Factura
  transactItems.push({
    Update: {
      TableName: TABLE_NAME,
      Key: { PK: pkFactura, SK: skFactura },
      UpdateExpression: "SET EstadoPago = :pagado, UpdatedAt = :now",
      ConditionExpression: "EstadoPago = :pendiente",
      ExpressionAttributeValues: {
        ":pagado": "PAGADO",
        ":now": now,
        ":pendiente": "PENDIENTE"
      }
    }
  });

  // 4. Insert Asiento Header
  transactItems.push({
    Put: {
      TableName: TABLE_NAME,
      Item: {
        PK: pkCabeceraAsiento,
        SK: skCabeceraAsiento,
        Type: 'Asiento',
        IdAsiento: idAsiento,
        Fecha: FechaPago,
        Observaciones: concepto,
        Usuario: sub, // O el nombre del usuario si está disponible
        Estado: 'Cuadrado',
        CreatedAt: now
      }
    }
  });

  // 5. Insert Apuntes
  const apuntes = [];
  const importeTotal = factura.Total;
  const cuentaContacto = factura.Contacto?.CuentaContable;

  if (!cuentaContacto) {
    throw new Error("La factura no tiene una cuenta contable asociada.");
  }

  if (factura.Tipo === 'Emitida') {
    // Debe: Banco (572...)
    apuntes.push({ SubcuentaId: CuentaBanco, Concepto: concepto, Debe: importeTotal, Haber: 0 });
    // Haber: Cliente (430...)
    apuntes.push({ SubcuentaId: cuentaContacto, Concepto: concepto, Debe: 0, Haber: importeTotal });
  } else if (factura.Tipo === 'Recibida') {
    // Debe: Proveedor (400...)
    apuntes.push({ SubcuentaId: cuentaContacto, Concepto: concepto, Debe: importeTotal, Haber: 0 });
    // Haber: Banco (572...)
    apuntes.push({ SubcuentaId: CuentaBanco, Concepto: concepto, Debe: 0, Haber: importeTotal });
  } else {
    throw new Error(`Tipo de factura no soportado: ${factura.Tipo}`);
  }

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
          Fecha: FechaPago,
          SubcuentaId: apunte.SubcuentaId,
          Concepto: apunte.Concepto,
          Documento: factura.Numero,
          Debe: apunte.Debe,
          Haber: apunte.Haber,
          GSI1PK: `TENANT#${TenantId}#EJER#${Ejercicio}#SUBC#${apunte.SubcuentaId}`,
          GSI1SK: `FECHA#${FechaPago}#APUNTE#${idAsiento}#${linea}`
        }
      }
    });
  });

  // 6. Ejecutar Transacción Atómica
  await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

  return true;
}
