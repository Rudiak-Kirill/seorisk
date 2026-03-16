import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

function getDbInstance() {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    throw new Error('POSTGRES_URL environment variable is not set');
  }

  if (!client) {
    client = postgres(postgresUrl);
  }

  if (!dbInstance) {
    dbInstance = drizzle(client, { schema });
  }

  return dbInstance;
}

export { client };
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, property, receiver) {
    return Reflect.get(getDbInstance() as object, property, receiver);
  },
});

export function ensureDb() {
  return getDbInstance();
}
