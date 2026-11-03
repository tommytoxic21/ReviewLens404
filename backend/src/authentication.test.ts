import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuth = vi.hoisted(() => vi.fn());

vi.mock('@clerk/fastify', () => ({ getAuth }));

import { requireAuthentication } from './authentication.js';

describe('requireAuthentication', () => {
  beforeEach(() => {
    getAuth.mockReset();
  });

  it('builds trusted context from the verified Clerk identity', async () => {
    getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: 'user_verified',
    });

    const app = Fastify();
    app.decorateRequest('authenticationContext', null);
    app.post(
      '/protected-test',
      { preHandler: requireAuthentication },
      async (request) => request.authenticationContext,
    );

    const res = await app.inject({
      method: 'POST',
      url: '/protected-test',
      payload: { userId: 'user_submitted' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user_verified' });
    expect(getAuth).toHaveBeenCalledWith(expect.anything(), {
      acceptsToken: 'session_token',
    });
    await app.close();
  });
});
