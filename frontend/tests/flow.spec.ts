import { test, expect } from '@playwright/test';

test.describe('Flujo completo de Contaco', () => {
  test('debe poder navegar por toda la aplicación y verificar el contenido de cada pantalla', async ({ page }) => {
    test.setTimeout(90000); // 90 seconds timeout
    
    // 1. Navegar a login
    await page.goto('https://contaco.vercel.app/login');
    
    // Verificar que estamos en la página de login
    await expect(page.locator('text=Iniciar Sesión').first()).toBeVisible();

    // 2. Iniciar sesión
    await page.fill('input[type="email"]', 'bea70zgz@gmail.com');
    await page.fill('input[type="password"]', 'Damaro959901');
    await page.click('button[type="submit"]');

    // 3. Esperar a que pase el login
    await page.waitForURL('**/', { timeout: 15000 });
    
    // Puede que nos redirija a empresas, o puede que no, verificamos y aseguramos que haya empresa
    await page.goto('https://contaco.vercel.app/empresas');
    await expect(page.locator('text=Gestión de Empresas').first()).toBeVisible();
    
    // Check if there is an existing company, if not create one
    await page.waitForTimeout(2000); // wait for fetch
    const createBtn = page.locator('button', { hasText: 'Nueva Empresa' });
    if (await createBtn.isVisible()) {
        const noEmpresas = page.locator('text=No hay empresas registradas');
        if (await noEmpresas.isVisible()) {
            await createBtn.click();
            await page.fill('input[placeholder="Ej: ContaCo Corp"]', 'Empresa de Pruebas Automáticas');
            await page.click('button:has-text("Crear Empresa")');
            await page.waitForTimeout(3000);
            // Recargar la página para que el Layout (TenantSelector) refresque las empresas
            await page.reload();
            await page.waitForTimeout(3000);
        }
    }
    
    // Forzamos un reload antes de ir al dashboard para asegurarnos de que el contexto de Tenant está listo
    await page.goto('https://contaco.vercel.app/');
    await page.waitForTimeout(2000);
    
    // 4. Comprobar Dashboard
    await expect(page.locator('text=Business Intelligence').first()).toBeVisible({ timeout: 15000 });
    
    // 5. Comprobar Facturas
    await page.goto('https://contaco.vercel.app/facturas');
    await expect(page.locator('text=Facturación').first()).toBeVisible({ timeout: 15000 });

    // 6. Comprobar Activos (Inmovilizado)
    await page.goto('https://contaco.vercel.app/activos');
    await expect(page.locator('text=Inmovilizado').first()).toBeVisible({ timeout: 15000 });

    // 7. Comprobar Diario
    await page.goto('https://contaco.vercel.app/diario');
    await expect(page.locator('text=Diario Histórico').first()).toBeVisible({ timeout: 15000 });
    
    // 8. Comprobar Mayor
    await page.goto('https://contaco.vercel.app/mayor');
    await expect(page.locator('text=Libro Mayor y Conciliación').first()).toBeVisible({ timeout: 15000 });

  });
});
