import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler = async (event: any) => {
  console.log("gestionarFacturas event:", JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const sub = event.identity?.claims?.sub;

  if (!sub) {
    throw new Error("Usuario no autenticado");
  }

  try {
    switch (fieldName) {
      case "listarFacturas":
        return await listarFacturas(sub, event.arguments.TenantId);
      case "crearFactura":
        return await crearFactura(sub, event.arguments.input);
      default:
        throw new Error(`Operación GraphQL desconocida: ${fieldName}`);
    }
  } catch (err: any) {
    console.error("Error en gestionarFacturas:", err);
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
}

async function listarFacturas(sub: string, tenantId: string) {
  await verificarAccesoTenant(sub, tenantId);

  // Listar facturas de todos los ejercicios (o se podría filtrar por ejercicio si estuviese en la key)
  const cmd = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `TENANT#${tenantId}`,
      ":skPrefix": "FACTURA#"
    }
  });

  const res = await docClient.send(cmd);
  
  if (!res.Items || res.Items.length === 0) {
    return [];
  }

  return res.Items.map(item => ({
    PK: item.PK,
    SK: item.SK,
    TenantId: tenantId,
    IdFactura: item.IdFactura,
    Numero: item.Numero,
    Tipo: item.Tipo,
    Fecha: item.Fecha,
    Contacto: item.Contacto,
    Base: item.Base,
    IVA: item.IVA,
    Total: item.Total,
    Estado: item.Estado,
    Lineas: item.Lineas || [],
    IdAsiento: item.IdAsiento
  }));
}

async function crearFactura(sub: string, input: any) {
  await verificarAccesoTenant(sub, input.TenantId);

  const {
    TenantId, Ejercicio, Usuario, Tipo, Numero, Fecha, NombreContacto, CuentaContableContacto, Lineas
  } = input;

  if (!Lineas || Lineas.length === 0) {
    throw new Error("La factura debe tener al menos una línea");
  }

  // 1. Calcular totales
  let baseTotal = 0;
  let ivaTotal = 0;

  const lineasFactura = Lineas.map((linea: any) => {
    const baseLinea = linea.Base;
    const importeIvaLinea = baseLinea * (linea.TipoIVA / 100);
    const totalLinea = baseLinea + importeIvaLinea;

    baseTotal += baseLinea;
    ivaTotal += importeIvaLinea;

    return {
      Concepto: linea.Concepto,
      Base: baseLinea,
      TipoIVA: linea.TipoIVA,
      ImporteIVA: Math.round(importeIvaLinea * 100) / 100,
      Total: Math.round(totalLinea * 100) / 100
    };
  });

  baseTotal = Math.round(baseTotal * 100) / 100;
  ivaTotal = Math.round(ivaTotal * 100) / 100;
  const importeTotal = Math.round((baseTotal + ivaTotal) * 100) / 100;

  // 2. Generar IDs y Fechas
  const idFactura = randomUUID().substring(0, 8);
  const idAsiento = randomUUID().substring(0, 8);
  const now = new Date().toISOString();

  let fechaVencimientoFinal = input.FechaVencimiento;
  if (!fechaVencimientoFinal) {
    const fechaObj = new Date(Fecha);
    fechaObj.setDate(fechaObj.getDate() + 30);
    fechaVencimientoFinal = fechaObj.toISOString().split('T')[0];
  }

  // 3. Preparar la Transacción
  const transactItems: any[] = [];

  // 3.1. Item de Factura
  const facturaItem = {
    PK: `TENANT#${TenantId}`,
    SK: `FACTURA#${Ejercicio}#${idFactura}`,
    Type: "Factura",
    IdFactura: idFactura,
    TenantId: TenantId,
    Numero: Numero,
    Tipo: Tipo,
    Fecha: Fecha,
    FechaVencimiento: fechaVencimientoFinal,
    Contacto: {
      Nombre: NombreContacto,
      CuentaContable: CuentaContableContacto
    },
    Base: baseTotal,
    IVA: ivaTotal,
    Total: importeTotal,
    Estado: "Emitida", // Using generic "Emitida"/"Recibida" state if applicable, but leaving as is, wait, "Pendiente" is EstadoPago.
    EstadoPago: "PENDIENTE",
    Lineas: lineasFactura,
    IdAsiento: idAsiento,
    CreatedAt: now
  };

  transactItems.push({
    Put: {
      TableName: TABLE_NAME,
      Item: facturaItem
    }
  });

  // 3.2. Asiento Contable
  const pkCabeceraAsiento = `TENANT#${TenantId}#EJER#${Ejercicio}`;
  const skCabeceraAsiento = `ASIENTO#${Fecha}#${idAsiento}`;

  transactItems.push({
    Put: {
      TableName: TABLE_NAME,
      Item: {
        PK: pkCabeceraAsiento,
        SK: skCabeceraAsiento,
        Type: 'Asiento',
        IdAsiento: idAsiento,
        Fecha: Fecha,
        Observaciones: `Factura ${Tipo} ${Numero} - ${NombreContacto}`,
        Usuario: Usuario,
        Estado: 'Cuadrado',
        CreatedAt: now
      }
    }
  });

  // 3.3. Apuntes del Asiento
  // TODO: Leer cuentas dinámicamente de la ficha del Contacto o Artículo
  const apuntes = [];

  if (Tipo === "Emitida") {
    // Debe: Cliente (430...)
    apuntes.push({
      SubcuentaId: CuentaContableContacto, Concepto: `Factura ${Numero}`, Debe: importeTotal, Haber: 0
    });
    // Haber: Ventas (7000000)
    apuntes.push({
      SubcuentaId: "7000000", Concepto: `Factura ${Numero}`, Debe: 0, Haber: baseTotal
    });
    // Haber: IVA Repercutido (4770000)
    apuntes.push({
      SubcuentaId: "4770000", Concepto: `Factura ${Numero}`, Debe: 0, Haber: ivaTotal
    });
  } else if (Tipo === "Recibida") {
    // Haber: Proveedor (400...)
    apuntes.push({
      SubcuentaId: CuentaContableContacto, Concepto: `Factura ${Numero}`, Debe: 0, Haber: importeTotal
    });
    // Debe: Compras (6000000)
    apuntes.push({
      SubcuentaId: "6000000", Concepto: `Factura ${Numero}`, Debe: baseTotal, Haber: 0
    });
    // Debe: IVA Soportado (4720000)
    apuntes.push({
      SubcuentaId: "4720000", Concepto: `Factura ${Numero}`, Debe: ivaTotal, Haber: 0
    });
  } else {
    throw new Error(`Tipo de factura no soportado: ${Tipo}`);
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
          Fecha: Fecha,
          SubcuentaId: apunte.SubcuentaId,
          Concepto: apunte.Concepto,
          Documento: Numero,
          Debe: apunte.Debe,
          Haber: apunte.Haber,
          GSI1PK: `TENANT#${TenantId}#EJER#${Ejercicio}#SUBC#${apunte.SubcuentaId}`,
          GSI1SK: `FECHA#${Fecha}#APUNTE#${idAsiento}#${linea}`
        }
      }
    });
  });

  await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

  return facturaItem;
}
