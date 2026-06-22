export const handler = async (event: any) => {
    console.log("procesarFicheroBanco event");
    
    const { contenidoBase64 } = event.arguments;

    try {
        // 1. Decodificar Base64
        const fileContent = Buffer.from(contenidoBase64, 'base64').toString('utf-8');
        
        // 2. Separar líneas
        const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const movimientos = [];
        let movActual: any = null;

        for (const line of lines) {
            const codigoRegistro = line.substring(0, 2);

            if (codigoRegistro === '22') {
                // Nuevo movimiento
                // Posiciones N43:
                // 10-15: Fecha Operación YYMMDD (6 chars)
                // 27: Signo (1=Debe/Pago, 2=Haber/Cobro)
                // 28-41: Importe entero con 2 decimales implícitos (14 chars)
                // 42-51: Documento (10 chars)
                // 52-53: Referencia 1
                // 54-69: Referencia 2 (Concepto base)

                const fechaStr = line.substring(10, 16);
                const signoStr = line.substring(27, 28);
                const importeStr = line.substring(28, 42);
                
                // Parse Fecha (YYMMDD) -> YYYY-MM-DD
                let year = parseInt(fechaStr.substring(0, 2), 10);
                year += (year > 50 ? 1900 : 2000); // heurística simple de año
                const month = fechaStr.substring(2, 4);
                const day = fechaStr.substring(4, 6);
                const fechaFormat = `${year}-${month}-${day}`;

                // Parse Importe
                let importe = parseInt(importeStr, 10) / 100.0;
                if (signoStr === '1') {
                    importe = -importe; // Pagos/Debe banco
                }

                movActual = {
                    Fecha: fechaFormat,
                    Importe: importe,
                    Concepto: line.substring(52, 105).trim() || "Movimiento sin concepto",
                    Referencia: ""
                };
                movimientos.push(movActual);

            } else if (codigoRegistro === '23' && movActual) {
                // Concepto ampliado (línea 23)
                // Posiciones: 04-81: Concepto extendido
                const conceptoExt = line.substring(4, 82).trim();
                movActual.Concepto = movActual.Concepto + " " + conceptoExt;
            }
        }

        return movimientos;
    } catch (error) {
        console.error("Error procesando N43:", error);
        throw new Error("No se pudo procesar el fichero Norma 43.");
    }
};
