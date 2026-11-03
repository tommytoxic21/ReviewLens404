import 'dotenv/config';
import { buildApp } from './app.js';

const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (!clerkPublishableKey || !clerkSecretKey) {
  throw new Error(
    'CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required to start the backend.',
  );
}

const app = buildApp({
  publishableKey: clerkPublishableKey,
  secretKey: clerkSecretKey,
});
const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
