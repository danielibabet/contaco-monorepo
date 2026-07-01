import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";

const handler = NextAuth({
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Email", type: "text" },
        password: { label: "Contraseña", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const clientId = process.env.COGNITO_CLIENT_ID!;
        const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
        const region = process.env.COGNITO_ISSUER?.split('.')[1] || 'eu-west-1';

        const username = credentials.username;
        const secretHash = crypto
          .createHmac('SHA256', clientSecret)
          .update(username + clientId)
          .digest('base64');

        const client = new CognitoIdentityProviderClient({ region });
        
        try {
          const command = new InitiateAuthCommand({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: clientId,
            AuthParameters: {
              USERNAME: username,
              PASSWORD: credentials.password,
              SECRET_HASH: secretHash
            }
          });

          const response = await client.send(command);
          if (response.AuthenticationResult) {
            return {
              id: username,
              name: username,
              email: username,
              access_token: response.AuthenticationResult.AccessToken,
              refresh_token: response.AuthenticationResult.RefreshToken,
              expires_in: response.AuthenticationResult.ExpiresIn,
            };
          }
          return null;
        } catch (error: any) {
          console.error("Login failed:", error);
          throw new Error(error.message || "Credenciales incorrectas");
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.accessToken = (user as any).access_token;
        token.refreshToken = (user as any).refresh_token;
        token.expiresAt = Math.floor(Date.now() / 1000) + ((user as any).expires_in as number);
        return token;
      }

      if (Math.floor(Date.now() / 1000) < (token.expiresAt as number) - 60) {
        return token;
      }

      try {
        const clientId = process.env.COGNITO_CLIENT_ID!;
        const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
        const region = process.env.COGNITO_ISSUER?.split('.')[1] || 'eu-west-1';

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
