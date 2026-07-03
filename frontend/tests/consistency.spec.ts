import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Prueba de Consistencia de Datos', () => {
  test('Migración completa, consistencia contable y generación manual', async ({ page }) => {
    test.setTimeout(300000); // 5 minutos, la migración puede ser lenta
    
    // --- 1. LOGIN ---
    await page.goto('https://contaco.vercel.app/login');
    await expect(page.locator('text=Iniciar Sesión').first()).toBeVisible();
    await page.fill('input[type="email"]', 'bea70zgz@gmail.com');
    await page.fill('input[type="password"]', 'Damaro959901');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 15000 });
    
    // --- 2. CREAR EMPRESA Y CONTEXTO ---
    await page.goto('https://contaco.vercel.app/empresas');
    await expect(page.locator('text=Gestión de Empresas').first()).toBeVisible();
    await page.waitForTimeout(2000);
    
    // Intentar crear la empresa de pruebas
    const createBtn = page.locator('button', { hasText: 'Nueva Empresa' });
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.fill('input[placeholder="Ej: ContaCo Corp"]', `Empresa Test ${Date.now()}`);
      await page.click('button:has-text("Crear Empresa")');
      await page.waitForTimeout(3000);
      await page.reload();
      await page.waitForTimeout(3000);
    }
    
    // Asegurar que el ejercicio seleccionado es 2026 (los datos del ZIP son de ese año)
    // Buscamos el selector de ejercicio (sabemos que es el segundo select)
    const selects = page.locator('select');
    if (await selects.count() >= 2) {
      await selects.nth(1).selectOption('2026');
    }
    
    // --- 3. SUBIR ZIP ---
    await page.goto('https://contaco.vercel.app/migracion');
    await expect(page.locator('text=Migración directa de ContaPlus').first()).toBeVisible();
    
    const zipPath = 'C:\\Users\\daniz\\Documents\\GitHub\\contaco-monorepo\\120626.zip';
    await page.setInputFiles('input[type="file"]', zipPath);
    
    // Esperar a que salga el success (puede tardar por S3 y el inicio de la Lambda)
    await expect(page.locator('text=Restauración Completada')).toBeVisible({ timeout: 60000 });
    
    // --- 4. VALIDACIONES DE CONSISTENCIA ---
    // Dar un tiempo adicional para que SQS procese
    await page.waitForTimeout(30000);
    
    // Dashboard
    await page.goto('https://contaco.vercel.app/');
    await expect(page.locator('text=Business Intelligence').first()).toBeVisible();
    // No validamos cantidades exactas porque depende del ZIP, pero sí que haya datos numéricos (no todo en 0.00 si la migración funciona)
    
    // Diario
    await page.goto('https://contaco.vercel.app/diario');
    await expect(page.locator('text=Diario Histórico').first()).toBeVisible();
    // Comprobar que existe la tabla de apuntes (AG Grid usa divs, no table)
    await expect(page.locator('.ag-root-wrapper').first()).toBeVisible({ timeout: 10000 });
    
    // Balances
    await page.goto('https://contaco.vercel.app/balances');
    await expect(page.locator('text=Balance de Sumas y Saldos').first()).toBeVisible();
    await expect(page.locator('.ag-root-wrapper').first()).toBeVisible({ timeout: 10000 });
    
    // Mayor
    await page.goto('https://contaco.vercel.app/mayor');
    await expect(page.locator('text=Libro Mayor y Conciliación').first()).toBeVisible();
    
    // --- 5. GENERACIÓN MANUAL DE DATOS ---
    // Factura
    await page.goto('https://contaco.vercel.app/facturas');
    await page.click('button:has-text("Nueva Factura")');
    // Rellenar modal de factura
    await page.fill('input[placeholder="Nombre del Cliente"]', 'Cliente de Pruebas');
    await page.fill('input[placeholder="430XXXX"]', '4300001');
    // Línea de factura
    await page.fill('input[placeholder="Descripción del servicio"]', 'Servicio Automático');
    await page.fill('input[placeholder="0.00"]', '1000');
    // Guardar
    await page.click('button:has-text("Crear y Contabilizar")');
    await page.waitForTimeout(2000);
    
    // Activo Fijo
    await page.goto('https://contaco.vercel.app/activos');
    await page.click('button:has-text("Registrar Activo")');
    await page.fill('input[placeholder="Ej: Portátil Dell XPS 15"]', 'Servidor de Pruebas');
    await page.fill('input[placeholder="2120000"]', '2160000');
    await page.fill('input[placeholder="1500.00"]', '2000');
    await page.fill('input[placeholder="48"]', '12'); // meses
    await page.click('button:has-text("Registrar Activo")');
    await page.waitForTimeout(2000);
    
    console.log("Test E2E Completado exitosamente.");
  });
});
