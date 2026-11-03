import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  db: Database;
  close: () => Promise<void>;
}

export function createDatabaseConnection(
  connectionString = process.env.DATABASE_URL,
): DatabaseConnection {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to connect to PostgreSQL.');
  }

  const pool = new Pool({ connectionString });

  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}
