import { test, expect } from '@playwright/test';

test.describe('Prueba de Experto Contable (Ciclo de Ingresos y Gastos)', () => {

  test('Ciclo completo: Creación, Facturación, Tesorería y Auditoría', async ({ page }) => {
    test.setTimeout(300000); // 5 minutos de timeout por seguridad

    console.log("Iniciando sesión...");
    await page.goto('https://contaco.vercel.app/login');
    await page.fill('input[type="email"]', 'bea70zgz@gmail.com');
    await page.fill('input[type="password"]', 'Damaro959901');
    await page.click('button:has-text("Iniciar Sesión")');
    await page.waitForURL('**/');

    console.log("Creando empresa limpia para test de experto...");
    await page.goto('https://contaco.vercel.app/empresas');
    await page.click('button:has-text("Nueva Empresa")');
    
    const ts = Date.now();
    const empresaNombre = `Experta Test ${ts}`;
    await page.fill('input[placeholder="Ej: ContaCo Corp"]', empresaNombre);
    await page.fill('input[placeholder="B12345678"]', `B${ts.toString().slice(-8)}`);
    // Las demás son opcionales en este modal, podemos simplemente guardar
    await page.click('button:has-text("Crear Empresa")');
    await page.waitForTimeout(3000);

    // Seleccionar la empresa desde el TenantSelector (Sidebar)
    // El Sidebar tiene selectores para cambiar de empresa
    await page.selectOption('select', { label: empresaNombre });
    await page.waitForTimeout(2000);

    // ---------------------------------------------------------------------------------
    // FASE 1: INGRESOS (VENTAS Y COBROS)
    // ---------------------------------------------------------------------------------
    console.log("Generando Venta (Factura Emitida)...");
    await page.goto('https://contaco.vercel.app/facturas');
    await page.click('button:has-text("Nueva Factura")');
    
    // Rellenar factura emitida
    await page.fill('input[placeholder="Nombre del Cliente"]', 'Cliente de Pruebas');
    await page.fill('input[placeholder="430XXXX"]', '4300001');
    await page.fill('input[placeholder="Descripción del servicio"]', 'Venta de Mercaderías');
    await page.fill('input[placeholder="0.00"]', '1000'); // Base imponible
    // IVA es 21% por defecto
    await page.click('button:has-text("Crear y Contabilizar")');
    await page.waitForTimeout(2000); // Esperar a que se guarde
    
    console.log("Cobrando Factura Emitida...");
    await page.click('button:has-text("Registrar Cobro/Pago")');
    await page.fill('input[placeholder="Ej: 5720001"]', '5720000'); // Banco
    await page.click('button:has-text("Guardar Transacción")');
    await page.waitForTimeout(2000);

    // ---------------------------------------------------------------------------------
    // FASE 2: GASTOS (COMPRAS Y PAGOS)
    // ---------------------------------------------------------------------------------
    console.log("Generando Compra (Factura Recibida)...");
    await page.click('button:has-text("Nueva Factura")');
    await page.selectOption('select', { value: 'Recibida' }); // Cambiar a Recibida
    
    // Rellenar factura recibida
    await page.fill('input[placeholder="Nombre del Proveedor"]', 'Proveedor de Pruebas');
    await page.fill('input[placeholder="400XXXX"]', '4000001');
    await page.fill('input[placeholder="Descripción del servicio"]', 'Compra de Material');
    await page.fill('input[placeholder="0.00"]', '500'); // Base imponible
    await page.click('button:has-text("Crear y Contabilizar")');
    await page.waitForTimeout(2000);

    console.log("Pagando Factura Recibida...");
    // El click es en el primer botón de pagar/cobrar de la lista de pendientes
    // Localizamos la factura recién creada en la fila
    await page.locator('tr:has-text("Proveedor de Pruebas") >> button:has-text("Registrar Cobro/Pago")').click();
    await page.fill('input[placeholder="Ej: 5720001"]', '5720000'); // Banco
    await page.click('button:has-text("Guardar Transacción")');
    await page.waitForTimeout(2000);

    // ---------------------------------------------------------------------------------
    // FASE 3: AUDITORÍA FINANCIERA Y CUADRES
    // ---------------------------------------------------------------------------------
    
    // AUDITORÍA 1: DASHBOARD
    console.log("Auditando Dashboard...");
    await page.goto('https://contaco.vercel.app/');
    await page.waitForTimeout(3000);
    // Verificamos tarjetas (ingresos y gastos totales sin IVA)
    await expect(page.locator('text=1.000,00 €').first()).toBeVisible(); // Ingresos
    await expect(page.locator('text=500,00 €').first()).toBeVisible(); // Gastos
    // En el Dashboard, los pendientes deberían desaparecer o quedarse en 0 tras cobrar. 
    // Como las tarjetas de pendiente se pintan según `facturasPendientes`, puede que estén vacías o "0,00"
    
    // AUDITORÍA 2: LIBRO MAYOR (EL BANCO)
    console.log("Auditando Mayor del Banco...");
    await page.goto('https://contaco.vercel.app/mayor');
    await page.waitForTimeout(2000);
    // Seleccionar cuenta de banco 5720000 (React Select usa una clase genérica)
    await page.locator('input[type="text"]').first().fill('5720000');
    await page.waitForTimeout(500);
    // Presionamos Enter porque la cuenta no existe en el catálogo estático pero al escribirla debería aceptarla
    // Si hay dropdown, hacemos click
    const bancoOption = page.locator('text=5720000').first();
    if (await bancoOption.isVisible()) {
        await bancoOption.click();
    } else {
        await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(2000);
    // Verificar saldo: Ingreso(1210) - Pago(605) = Saldo 605,00
    await expect(page.locator('text=605,00 €').first()).toBeVisible();

    // AUDITORÍA 3: LIBRO MAYOR (IVA Soportado y Repercutido)
    console.log("Auditando Mayor IVA Repercutido...");
    await page.goto('https://contaco.vercel.app/mayor'); // Forzamos recarga
    await page.waitForTimeout(2000);
    await page.locator('input[type="text"]').first().fill('4770021');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=210,00 €').first()).toBeVisible();

    console.log("Auditando Mayor IVA Soportado...");
    await page.goto('https://contaco.vercel.app/mayor'); // Forzamos recarga
    await page.waitForTimeout(2000);
    await page.locator('input[type="text"]').first().fill('4720021');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=105,00 €').first()).toBeVisible();

    // AUDITORÍA 4: BALANCE DE SUMAS Y SALDOS
    console.log("Auditando Balance de Sumas y Saldos (Cuadre)...");
    await page.goto('https://contaco.vercel.app/balances');
    await page.waitForTimeout(4000);
    
    // Suma Debe Total:
    // Banco: 1210
    // Cliente: 1210
    // Proveedor: 605
    // Compras: 500
    // IVA Sop: 105
    // Total Debe = 3630€
    // Confirmamos que NO hay descuadre alert
    const descuadre = page.locator('text=Descuadre');
    await expect(descuadre).toBeHidden(); 

    console.log("✓ Auditoría de Experto Contable finalizada. Los libros cuadran perfectamente.");
  });

});
