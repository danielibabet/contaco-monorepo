import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { getSession } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const httpLink = createHttpLink({
  uri: API_URL,
});

const authLink = setContext(async (_, { headers }) => {
  // Pedimos la sesión actual de NextAuth a la caché local
  const session: any = await getSession();
  
  return {
    headers: {
      ...headers,
      // AppSync Cognito User Pools espera el accessToken crudo
      Authorization: session?.accessToken ? session.accessToken : "",
    }
  }
});

export const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});
