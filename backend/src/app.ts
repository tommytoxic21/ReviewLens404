import { clerkPlugin, type ClerkFastifyOptions } from '@clerk/fastify';
import Fastify from 'fastify';

export function buildApp(clerkOptions: ClerkFastifyOptions = {}) {
  const app = Fastify({ logger: true });

  app.decorateRequest('authenticationContext', null);
  app.register(clerkPlugin, clerkOptions);

  app.get('/health', async () => ({ status: 'ok' }));
  return app;
}
