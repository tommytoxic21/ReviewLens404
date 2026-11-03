import 'dotenv/config';

import { buildApp } from './app.js';
import { createDatabaseConnection } from './db/client.js';
import { ingestionRoutes } from './ingestion/ingestionRoutes.js';

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

// S1-019 / S1-022: Connect review ingestion to PostgreSQL.
const connection = createDatabaseConnection();

app.register(ingestionRoutes, {
  db: connection.db,
});

// Close database connections when the server shuts down.
app.addHook('onClose', async () => {
  await connection.close();
});

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: '0.0.0.0' }).catch(async (err) => {
  app.log.error(err);
  await app.close();
  process.exit(1);
});
