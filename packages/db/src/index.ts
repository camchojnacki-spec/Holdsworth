import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

const connectionString = process.env.DATABASE_URL!;

// Singleton pattern — prevents connection pool exhaustion during Next.js hot-reloads
const globalForDb = globalThis as unknown as { _pgClient: ReturnType<typeof postgres> | undefined };

const client = globalForDb._pgClient ?? postgres(connectionString, {
  max: 10,                // limit connection pool size
  idle_timeout: 20,       // close idle connections after 20s
  connect_timeout: 10,    // fail fast on connection issues
});

if (process.env.NODE_ENV !== "production") {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema });

export * from "./schema/index";
export { schema };
export { enqueuePriceLookup, type CardPricePayload } from "./jobs";
