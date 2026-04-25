import { createClient, Client } from "@libsql/client";

let _db: Client | null = null;

export function getDb(): Client {
  if (_db) return _db;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) throw new Error("TURSO_DATABASE_URL is not configured.");

  _db = createClient({ url, ...(authToken ? { authToken } : {}) });
  return _db;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      companyId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      demographicsEnabled INTEGER NOT NULL DEFAULT 0,
      allowedLanguages TEXT NOT NULL DEFAULT '["ru","en","tr"]',
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      lastActivityAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      event TEXT NOT NULL,
      dimension TEXT,
      detail TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_token ON events(token);
  `);
}
