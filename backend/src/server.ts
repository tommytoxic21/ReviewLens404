import 'dotenv/config';

import { buildApp } from './app.js';
import { createDatabaseConnection } from './db/client.js';
import { ingestionRoutes } from './ingestion/ingestionRoutes.js';
import { SerpApiGoogleMapsReviewSource } from './reviews/serpApiGoogleMapsReviewSource.js';

const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;
const serpApiKey = process.env.SERPAPI_API_KEY;

if (!clerkPublishableKey || !clerkSecretKey || !databaseUrl || !serpApiKey) {
  throw new Error(
    'CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, DATABASE_URL, and SERPAPI_API_KEY are required to start the backend.',
  );
}

const databaseConnection = createDatabaseConnection(databaseUrl);
const app = buildApp({
  clerk: {
    publishableKey: clerkPublishableKey,
    secretKey: clerkSecretKey,
  },
  api: {
    database: databaseConnection.db,
    reviewSource: new SerpApiGoogleMapsReviewSource(serpApiKey),
  },
});

app.register(ingestionRoutes, { db: databaseConnection.db });
app.addHook('onClose', () => databaseConnection.close());

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: '0.0.0.0' }).catch(async (error) => {
  app.log.error(error);
  await app.close();
  process.exit(1);
});

async function shutdown() {
  await app.close();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
