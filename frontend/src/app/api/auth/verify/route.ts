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
    const region = process.env.COGNITO_ISSUER?.split('.')[2] || 'eu-west-1';

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
    return NextResponse.json({ error: error.message || "Error al verificar el código" }, { status: 400 });
  }
}
