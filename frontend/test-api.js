const { CognitoIdentityProviderClient, InitiateAuthCommand } = require("@aws-sdk/client-cognito-identity-provider");
require('dotenv').config({ path: '.env.local' });

async function testBackend() {
  console.log("=== INICIANDO PRUEBA DE BACKEND E2E ===");
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const username = "bea70zgz@gmail.com";
  const password = "Damaro959901";

  const client = new CognitoIdentityProviderClient({ region: "eu-west-1" });
  
  console.log(`1. Autenticando con Cognito (User: ${username})...`);
  try {
    const authResponse = await client.send(new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    }));
    
    const idToken = authResponse.AuthenticationResult.IdToken;
    console.log("✅ Autenticación exitosa. Token obtenido.");
    
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    
    console.log("2. Consultando Empresas (AppSync)...");
    const listarEmpresasQuery = `
      query {
        listarEmpresas {
          TenantId
          Nombre
          Rol
        }
      }
    `;
    
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': idToken },
      body: JSON.stringify({ query: listarEmpresasQuery })
    });
    
    const data = await res.json();
    console.log("✅ Respuesta AppSync ListarEmpresas:", JSON.stringify(data.data.listarEmpresas, null, 2));

    let tenantId = "";
    if (data.data.listarEmpresas && data.data.listarEmpresas.length > 0) {
      tenantId = data.data.listarEmpresas[0].TenantId;
    } else {
      console.log("3. Creando empresa de prueba...");
      const crearEmpresaMutation = `
        mutation {
          crearEmpresa(input: { Nombre: "Test E2E Corp" }) {
            TenantId
            Nombre
          }
        }
      `;
      const resCrear = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': idToken },
        body: JSON.stringify({ query: crearEmpresaMutation })
      });
      const dataCrear = await resCrear.json();
      console.log("✅ Empresa Creada:", dataCrear.data.crearEmpresa);
      tenantId = dataCrear.data.crearEmpresa.TenantId;
    }
    
    console.log("4. Probando RBAC en Dashboard (requiere ADMIN)...");
    const dashboardQuery = `
      query {
        obtenerDashboardStats(TenantId: "${tenantId}", Ejercicio: "2026") {
          TotalIngresos
        }
      }
    `;
    const resDash = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': idToken },
      body: JSON.stringify({ query: dashboardQuery })
    });
    const dataDash = await resDash.json();
    if (dataDash.errors) {
       console.log("❌ Error RBAC:", dataDash.errors[0].message);
    } else {
       console.log("✅ RBAC Exitoso. Dashboard Stats permitidas:", dataDash.data.obtenerDashboardStats);
    }
    
    console.log("=== PRUEBA DE BACKEND FINALIZADA ===");

  } catch (error) {
    console.error("❌ Error en la prueba:", error.message);
  }
}

testBackend();
