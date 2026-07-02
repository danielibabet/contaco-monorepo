import { NextResponse } from 'next/server';
import { CognitoIdentityProviderClient, ForgotPasswordCommand } from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "El email es requerido" }, { status: 400 });
    }

    const clientId = process.env.COGNITO_CLIENT_ID!;
    const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
    const region = process.env.COGNITO_ISSUER?.split('.')[2] || 'eu-west-1';

    const secretHash = crypto
      .createHmac('SHA256', clientSecret)
      .update(email + clientId)
      .digest('base64');

    const client = new CognitoIdentityProviderClient({ region });
    
    const command = new ForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      SecretHash: secretHash,
    });

    await client.send(command);

    return NextResponse.json({ message: "Código de recuperación enviado" });
  } catch (error: any) {
    console.error("Forgot Password Error:", error);
    let errorMessage = "Error al solicitar la recuperación";
    if (error.name === "UserNotFoundException") {
      errorMessage = "No existe ninguna cuenta con este email.";
    } else if (error.name === "LimitExceededException") {
      errorMessage = "Demasiados intentos. Inténtalo de nuevo más tarde.";
    }
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
