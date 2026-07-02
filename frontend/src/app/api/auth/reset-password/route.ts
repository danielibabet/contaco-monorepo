import { NextResponse } from 'next/server';
import { CognitoIdentityProviderClient, ConfirmForgotPasswordCommand } from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { email, code, newPassword } = await req.json();

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: "Email, código y nueva contraseña son requeridos" }, { status: 400 });
    }

    const clientId = process.env.COGNITO_CLIENT_ID!;
    const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
    const region = process.env.COGNITO_ISSUER?.split('.')[1] || 'eu-west-1';

    const secretHash = crypto
      .createHmac('SHA256', clientSecret)
      .update(email + clientId)
      .digest('base64');

    const client = new CognitoIdentityProviderClient({ region });
    
    const command = new ConfirmForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
      SecretHash: secretHash,
    });

    await client.send(command);

    return NextResponse.json({ message: "Contraseña actualizada exitosamente" });
  } catch (error: any) {
    console.error("Reset Password Error:", error);
    let errorMessage = "Error al restablecer la contraseña";
    if (error.name === "CodeMismatchException") {
      errorMessage = "Código incorrecto. Vuelve a intentarlo.";
    } else if (error.name === "ExpiredCodeException") {
      errorMessage = "El código ha expirado. Solicita uno nuevo.";
    } else if (error.name === "InvalidPasswordException") {
      errorMessage = "La nueva contraseña no cumple los requisitos.";
    } else if (error.name === "UserNotFoundException") {
      errorMessage = "No existe ninguna cuenta con este email.";
    }
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
