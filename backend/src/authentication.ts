import { getAuth } from '@clerk/fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthenticationContext {
  userId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authenticationContext: AuthenticationContext | null;
  }
}

export async function requireAuthentication(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = getAuth(request, { acceptsToken: 'session_token' });

  if (!auth.isAuthenticated || !auth.userId) {
    return reply.code(401).send({ error: 'Authentication required.' });
  }

  request.authenticationContext = { userId: auth.userId };
}
