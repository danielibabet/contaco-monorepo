import { NextResponse } from 'next/server';
import { CognitoIdentityProviderClient, SignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña son requeridos" }, { status: 400 });
    }

    const clientId = process.env.COGNITO_CLIENT_ID!;
    const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
    const region = process.env.COGNITO_ISSUER?.split('.')[2] || 'eu-west-1';

    const secretHash = crypto
      .createHmac('SHA256', clientSecret)
      .update(email + clientId)
      .digest('base64');

    const client = new CognitoIdentityProviderClient({ region });
    
    const command = new SignUpCommand({
      ClientId: clientId,
      Username: email,
      Password: password,
      SecretHash: secretHash,
      UserAttributes: [
        { Name: "email", Value: email }
      ]
    });

    const response = await client.send(command);

    return NextResponse.json({ message: "Usuario registrado", userSub: response.UserSub });
  } catch (error: any) {
    console.error("Register Error:", error);
    let errorMessage = "Error al registrar usuario";
    if (error.name === "UsernameExistsException") {
      errorMessage = "El usuario ya existe. Por favor, inicia sesión.";
    } else if (error.name === "InvalidPasswordException") {
      errorMessage = "La contraseña no cumple los requisitos de seguridad.";
    } else if (error.name === "InvalidParameterException") {
      errorMessage = "Parámetros inválidos. Comprueba tu correo.";
    }
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
