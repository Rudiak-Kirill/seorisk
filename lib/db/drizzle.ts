import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const postgresUrl = process.env.POSTGRES_URL;

export const client = postgresUrl ? postgres(postgresUrl) : null;
export const db = (client
  ? drizzle(client, { schema })
  : (null as unknown as ReturnType<typeof drizzle>));

export function ensureDb() {
  if (!postgresUrl) {
    throw new Error('POSTGRES_URL environment variable is not set');
  }
  return db;
}
