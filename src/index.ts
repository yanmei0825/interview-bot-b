import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import surveyRouter from "./routes/survey";
import companyRouter from "./routes/company";
import { initDb } from "./db";
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
app.use("/survey/:token/voice/transcribe", express.raw({ type: "audio/*", limit: "50mb" }));
app.use("/survey/:token/voice/send", express.raw({ type: "audio/*", limit: "50mb" }));

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

// Local dev: listen on port
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

// Vercel serverless export
export default app;
