import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import surveyRouter from "./routes/survey";
import companyRouter from "./routes/company";
import { initDb, getDb } from "./db";
import { seedDefaultProject } from "./seed";
import { getUsageSummary, getUsageLog } from "./llm";
import { getEvents } from "./session";
import { InterviewEvent } from "./types";

dotenv.config();

const app = express();

app.use(cors());
app.use((req, _res, next) => {
  console.log(`[${req.method}] ${req.path}`);
  next();
});
app.use(express.json());
// Parse raw binary for audio uploads — only activates when Content-Type is audio/*
app.use(express.raw({ type: "audio/*", limit: "50mb" }));

// Init DB + seed on first request (lazy, safe for serverless cold starts)
let initialized = false;
app.use(async (_req, _res, next) => {
  if (!initialized) {
    await initDb();
    await seedDefaultProject();
    initialized = true;
  }
  next();
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "interview-backend" });
});

app.get("/usage", async (_req, res) => {
  const events: InterviewEvent[] = await getEvents();
  const eventSummary: Record<string, number> = {};
  for (const e of events) {
    eventSummary[e.event] = (eventSummary[e.event] ?? 0) + 1;
  }
  res.json({
    llm: { summary: getUsageSummary(), log: getUsageLog() },
    events: { summary: eventSummary, total: events.length, log: events.slice(-200) },
  });
});

app.use("/survey", surveyRouter);
app.use("/companies", companyRouter);

// Cron cleanup endpoint (also used by Vercel cron job)
app.get("/api/cron/cleanup", async (_req, res) => {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const result = await getDb().execute({
      sql: "DELETE FROM sessions WHERE expiresAt IS NOT NULL AND expiresAt < ?",
      args: [cutoff],
    });
    const deleted = (result as any).rowsAffected ?? 0;
    console.log(`[cron/cleanup] Deleted ${deleted} expired session(s)`);
    res.json({ deleted });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "unknown" });
  }
});

// Local dev: listen on port
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Abandoned session cleanup — runs every hour, deletes sessions expired > 24h ago
    const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
    const ABANDONED_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h past expiry

    setInterval(async () => {
      try {
        const cutoff = Date.now() - ABANDONED_THRESHOLD_MS;
        const result = await getDb().execute({
          sql: "DELETE FROM sessions WHERE expiresAt IS NOT NULL AND expiresAt < ?",
          args: [cutoff],
        });
        const deleted = (result as any).rowsAffected ?? 0;
        if (deleted > 0) console.log(`[cleanup] Deleted ${deleted} expired session(s)`);
      } catch (err: any) {
        console.error("[cleanup] Failed:", err?.message);
      }
    }, CLEANUP_INTERVAL_MS);
  });
}

// Vercel serverless export
export default app;
