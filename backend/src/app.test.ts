import { describe, it, expect } from 'vitest';
import { buildApp } from './app.js';
import { requireAuthentication } from './authentication.js';

const clerkOptions = {
  publishableKey: 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k',
  secretKey: 'sk_test_not-a-real-secret',
  telemetry: { disabled: true },
};

describe('GET /health', () => {
  it('remains public', async () => {
    const app = buildApp(clerkOptions);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});

describe('requireAuthentication', () => {
  it.each([
    { name: 'a missing session', headers: {} },
    {
      name: 'an invalid session',
      headers: { authorization: 'Bearer invalid-session-token' },
    },
  ])('rejects $name', async ({ headers }) => {
    const app = buildApp(clerkOptions);
    app.get(
      '/protected-test',
      { preHandler: requireAuthentication },
      async (request) => request.authenticationContext,
    );

    const res = await app.inject({
      method: 'GET',
      url: '/protected-test',
      headers,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Authentication required.' });
    await app.close();
  });
});
