import { NextResponse } from 'next/server';
import { CognitoIdentityProviderClient, ConfirmSignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Email y código son requeridos" }, { status: 400 });
    }

    const clientId = process.env.COGNITO_CLIENT_ID!;
    const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
    const region = process.env.COGNITO_ISSUER?.split('.')[1] || 'eu-west-1';

    const secretHash = crypto
      .createHmac('SHA256', clientSecret)
      .update(email + clientId)
      .digest('base64');

    const client = new CognitoIdentityProviderClient({ region });
    
    const command = new ConfirmSignUpCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
      SecretHash: secretHash,
    });

    await client.send(command);

    return NextResponse.json({ message: "Usuario verificado exitosamente" });
  } catch (error: any) {
    console.error("Verify Error:", error);
    let errorMessage = "Error al verificar el código";
    if (error.name === "CodeMismatchException") {
      errorMessage = "Código incorrecto. Vuelve a intentarlo.";
    } else if (error.name === "ExpiredCodeException") {
      errorMessage = "El código ha expirado. Solicita uno nuevo.";
    } else if (error.name === "NotAuthorizedException") {
      errorMessage = "El usuario ya ha sido verificado o la sesión es inválida.";
    }
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
