import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";

const handler = NextAuth({
  providers: [
    CognitoProvider({
      clientId: process.env.COGNITO_CLIENT_ID!,
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,
      issuer: process.env.COGNITO_ISSUER!,
    })
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Login inicial
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = Math.floor(Date.now() / 1000) + (account.expires_in as number);
        return token;
      }

      // Si el token aún es válido (damos 60 segundos de margen)
      if (Math.floor(Date.now() / 1000) < (token.expiresAt as number) - 60) {
        return token;
      }

      // El token ha expirado, lo refrescamos
      try {
        const clientId = process.env.COGNITO_CLIENT_ID!;
        const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
        const region = process.env.COGNITO_ISSUER?.split('.')[2] || 'eu-west-1';

        const username = token.sub!;
        const secretHash = crypto
          .createHmac('SHA256', clientSecret)
          .update(username + clientId)
          .digest('base64');

        const client = new CognitoIdentityProviderClient({ region });
        
        const command = new InitiateAuthCommand({
          AuthFlow: "REFRESH_TOKEN_AUTH",
          ClientId: clientId,
          AuthParameters: {
            REFRESH_TOKEN: token.refreshToken as string,
            SECRET_HASH: secretHash
          }
        });

        const response = await client.send(command);

        return {
          ...token,
          accessToken: response.AuthenticationResult?.AccessToken || token.accessToken,
          expiresAt: Math.floor(Date.now() / 1000) + (response.AuthenticationResult?.ExpiresIn || 3600),
        };
      } catch (error) {
        console.error("Error al refrescar el token de acceso", error);
        return {
          ...token,
          error: "RefreshAccessTokenError",
        };
      }
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session as any).error = token.error;
      return session;
    }
  }
});

export { handler as GET, handler as POST };
