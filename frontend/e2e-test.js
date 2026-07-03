const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUT_DIR = 'C:/Users/daniz/.gemini/antigravity-ide/brain/687512ad-6965-4e58-b1a0-afe1950accb8/scratch';

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('1. Navegando a contaco.vercel.app...');
  await page.goto('https://contaco.vercel.app/login', { waitUntil: 'networkidle2' });

  console.log('2. Iniciando sesión...');
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', 'bea70zgz@gmail.com');
  await page.type('input[type="password"]', 'Damaro959901');
  
  // Buscar el botón de login (submit)
  await page.click('button[type="submit"]');

  console.log('3. Esperando autenticación y carga de dashboard...');
  // Esperar a que la navegación termine
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // Puede que redirija a /empresas si no hay empresas seleccionadas
  const currentUrl = page.url();
  console.log('URL actual tras login:', currentUrl);
  
  await page.screenshot({ path: path.join(OUT_DIR, '01_post_login.png') });

  // Si estamos en empresas y nos pide crear una, vamos a crearla
  if (currentUrl.includes('/empresas')) {
     console.log('Creando empresa ficticia...');
     // Asumimos que hay un input text y un submit para crear empresa
     try {
       await page.waitForSelector('input[placeholder*="Nombre"]', { timeout: 5000 });
       await page.type('input[placeholder*="Nombre"]', 'Empresa de Pruebas Automáticas');
       
       // Buscar el primer botón submit
       await page.evaluate(() => {
         const buttons = Array.from(document.querySelectorAll('button'));
         const createBtn = buttons.find(b => b.textContent.includes('Crear Empresa') || b.textContent.includes('Guardar'));
         if (createBtn) createBtn.click();
       });
       await page.waitForTimeout(3000);
       await page.screenshot({ path: path.join(OUT_DIR, '02_empresa_creada.png') });
     } catch (e) {
       console.log('No se pudo automatizar la creación de empresa, o ya existía:', e.message);
     }
  }

  // Ahora vamos a ir navegando por las rutas para probar que el RBAC funciona y no nos echa.
  const routes = [
    { name: 'Dashboard', url: 'https://contaco.vercel.app/' },
    { name: 'Facturacion', url: 'https://contaco.vercel.app/facturas' },
    { name: 'Inmovilizado', url: 'https://contaco.vercel.app/activos' },
    { name: 'Diario', url: 'https://contaco.vercel.app/diario' }
  ];

  for (let i = 0; i < routes.length; i++) {
    console.log(`Navegando a ${routes[i].name}...`);
    await page.goto(routes[i].url, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000); // Esperar a que carguen datos del API
    await page.screenshot({ path: path.join(OUT_DIR, `0${i + 3}_${routes[i].name}.png`) });
  }

  console.log('Prueba terminada con éxito. Cerrando navegador.');
  await browser.close();
})();
