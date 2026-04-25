import { InterviewSession } from "../types";
import { getDb } from "../db";
import { SessionStore } from "./SessionStore";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days default

function serialize(session: InterviewSession): string {
  return JSON.stringify(session);
}

function deserialize(data: string): InterviewSession {
  return JSON.parse(data) as InterviewSession;
}

export class TursoSessionStore implements SessionStore {
  async get(token: string): Promise<InterviewSession | undefined> {
    const result = await getDb().execute({
      sql: "SELECT data, expiresAt FROM sessions WHERE token = ?",
      args: [token],
    });
    const row = result.rows[0] as { data: string; expiresAt: number | null } | undefined;
    if (!row) return undefined;
    // Treat expired sessions as not found
    if (row.expiresAt && row.expiresAt < Date.now()) {
      await this.delete(token);
      return undefined;
    }
    return deserialize(row.data as string);
  }

  async set(token: string, session: InterviewSession): Promise<void> {
    session.lastActivityAt = Date.now();
    const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
    await getDb().execute({
      sql: `INSERT INTO sessions (token, data, lastActivityAt, expiresAt)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(token) DO UPDATE SET
              data = excluded.data,
              lastActivityAt = excluded.lastActivityAt,
              expiresAt = excluded.expiresAt`,
      args: [token, serialize(session), session.lastActivityAt, expiresAt],
    });
  }

  async delete(token: string): Promise<void> {
    await getDb().execute({
      sql: "DELETE FROM sessions WHERE token = ?",
      args: [token],
    });
  }

  async extendTTL(token: string, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    await getDb().execute({
      sql: "UPDATE sessions SET expiresAt = ? WHERE token = ?",
      args: [expiresAt, token],
    });
  }
}
