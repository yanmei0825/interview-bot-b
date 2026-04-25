import { Pool } from "pg";

let _pool: Pool | null = null;

export function getDb(): Pool {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");

  _pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  return _pool;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "createdAt" BIGINT NOT NULL
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      "demographicsEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
      "allowedLanguages" TEXT NOT NULL DEFAULT '["ru","en","tr"]',
      "createdAt" BIGINT NOT NULL
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      "lastActivityAt" BIGINT NOT NULL,
      "expiresAt" BIGINT
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL,
      event TEXT NOT NULL,
      dimension TEXT,
      detail TEXT,
      timestamp BIGINT NOT NULL
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_events_token ON events(token)
  `);
}
