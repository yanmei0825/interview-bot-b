import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initDb, getDb } from "../db";

// Vercel cron: runs every hour via vercel.json schedule
// Deletes sessions expired more than 24h ago
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    await initDb();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const result = await getDb().query(
      `DELETE FROM sessions WHERE "expiresAt" IS NOT NULL AND "expiresAt" < $1`,
      [cutoff]
    );
    const deleted = result.rowCount ?? 0;
    console.log(`[cron/cleanup] Deleted ${deleted} expired session(s)`);
    res.status(200).json({ deleted });
  } catch (err: any) {
    console.error("[cron/cleanup] Error:", err?.message);
    res.status(500).json({ error: err?.message ?? "unknown" });
  }
}
