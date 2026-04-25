import { InterviewSession } from "../types";
import { getDb } from "../db";
import { SessionStore } from "./SessionStore";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export class PgSessionStore implements SessionStore {
  async get(token: string): Promise<InterviewSession | undefined> {
    const result = await getDb().query<{ data: string; expiresAt: string | null }>(
      `SELECT data, "expiresAt" FROM sessions WHERE token = $1`,
      [token]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    if (row.expiresAt && Number(row.expiresAt) < Date.now()) {
      await this.delete(token);
      return undefined;
    }
    return JSON.parse(row.data) as InterviewSession;
  }

  async set(token: string, session: InterviewSession): Promise<void> {
    session.lastActivityAt = Date.now();
    const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
    await getDb().query(
      `INSERT INTO sessions (token, data, "lastActivityAt", "expiresAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET
         data = EXCLUDED.data,
         "lastActivityAt" = EXCLUDED."lastActivityAt",
         "expiresAt" = EXCLUDED."expiresAt"`,
      [token, JSON.stringify(session), session.lastActivityAt, expiresAt]
    );
  }

  async delete(token: string): Promise<void> {
    await getDb().query(`DELETE FROM sessions WHERE token = $1`, [token]);
  }

  async extendTTL(token: string, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    await getDb().query(
      `UPDATE sessions SET "expiresAt" = $1 WHERE token = $2`,
      [expiresAt, token]
    );
  }
}
