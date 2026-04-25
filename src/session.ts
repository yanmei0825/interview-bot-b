import { v4 as uuidv4 } from "uuid";
import {
  InterviewSession,
  InterviewState,
  Language,
  DimensionKey,
  Demographics,
  InterviewEvent,
} from "./types";
import { DIMENSION_ORDER, getDimension } from "./dimensions";
import db from "./db";


function initCoverage(): InterviewSession["coverage"] {
  const coverage = {} as InterviewSession["coverage"];
  for (const key of DIMENSION_ORDER) {
    coverage[key] = { key, covered: false, turnCount: 0, signals: [], depthLevel: 1, coverageScore: 0 };
  }
  return coverage;
}

function serializeSession(session: InterviewSession): string {
  return JSON.stringify(session);
}

function deserializeSession(data: string): InterviewSession {
  return JSON.parse(data) as InterviewSession;
}


export function computeDimensionMetrics(
  turnCount: number,
  minTurns: number,
  maxTurns: number,
  signalCount: number
): { depthLevel: number; coverageScore: number } {
  const ratio = turnCount / Math.max(maxTurns, 1);
  const depthLevel = turnCount < minTurns ? 1 : ratio < 0.66 ? 2 : 3;
  const coverageScore = Math.min(signalCount / 5, 1);
  return { depthLevel, coverageScore };
}

export function createSession(
  projectId: string,
  demographicsEnabled: boolean
): InterviewSession {
  const token = uuidv4();
  const session: InterviewSession = {
    token,
    projectId,
    language: null,
    demographicsEnabled,
    demographics: null,
    demographicsSubmitted: false,
    started: false,
    finished: false,
    state: "INIT",
    currentDimension: "D1",
    dimensionIndex: 0,
    coverage: initCoverage(),
    history: [],
    turnCount: 0,
    questionCount: 0,
    askedQuestionFps: [],
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  db.prepare("INSERT INTO sessions (token, data, lastActivityAt) VALUES (?, ?, ?)")
    .run(token, serializeSession(session), session.lastActivityAt);
  return session;
}

export function getSession(token: string): InterviewSession | undefined {
  const row = db.prepare("SELECT data FROM sessions WHERE token = ?").get(token) as { data: string } | undefined;
  if (!row) return undefined;
  return deserializeSession(row.data);
}

export function saveSession(session: InterviewSession): void {
  session.lastActivityAt = Date.now();
  db.prepare("UPDATE sessions SET data = ?, lastActivityAt = ? WHERE token = ?")
    .run(serializeSession(session), session.lastActivityAt, session.token);
}

export function logEvent(
  token: string,
  event: string,
  detail?: string,
  dimension?: DimensionKey
): void {
  db.prepare("INSERT INTO events (token, event, dimension, detail, timestamp) VALUES (?, ?, ?, ?, ?)")
    .run(token, event, dimension ?? null, detail ?? null, Date.now());
}

export function advanceDimension(session: InterviewSession): boolean {
  const nextIndex = session.dimensionIndex + 1;
  const dim = getDimension(session.currentDimension);
  const cov = session.coverage[session.currentDimension];
  const { depthLevel, coverageScore } = computeDimensionMetrics(cov.turnCount, dim.minTurns, dim.maxTurns, cov.signals.length);
  cov.depthLevel = depthLevel;
  cov.coverageScore = coverageScore;
  cov.covered = true;

  if (nextIndex >= DIMENSION_ORDER.length) {
    session.finished = true;
    session.state = "COMPLETE";
    return false;
  }

  session.dimensionIndex = nextIndex;
  session.currentDimension = DIMENSION_ORDER[nextIndex]!;
  return true;
}

export function shouldAdvance(session: InterviewSession): boolean {
  const dim = getDimension(session.currentDimension);
  const cov = session.coverage[session.currentDimension];

  if (cov.turnCount >= dim.maxTurns) return true;
  if (cov.turnCount >= dim.minTurns && cov.coverageScore >= dim.coverageThreshold) return true;

  if (cov.turnCount >= dim.minTurns) {
    const recentUserMessages = session.history.filter((m) => m.role === "user").slice(-2);
    const allTooShort = recentUserMessages.length >= 2 &&
      recentUserMessages.every((m) => m.content.trim().split(/\s+/).length <= 2);
    if (allTooShort) return true;
  }

  return false;
}

export function updateDimensionMetrics(session: InterviewSession): void {
  const dim = getDimension(session.currentDimension);
  const cov = session.coverage[session.currentDimension];
  const { depthLevel, coverageScore } = computeDimensionMetrics(cov.turnCount, dim.minTurns, dim.maxTurns, cov.signals.length);
  cov.depthLevel = depthLevel;
  cov.coverageScore = coverageScore;
}

export function getSessionSummary(session: InterviewSession) {
  return {
    token: session.token,
    projectId: session.projectId,
    language: session.language,
    finished: session.finished,
    state: session.state,
    currentDimension: session.finished ? null : session.currentDimension,
    turnCount: session.turnCount,
    questionCount: session.questionCount,
    coverage: session.coverage,
    demographics: session.demographics,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
  };
}

export function getAllSessionsByProject(projectId: string): InterviewSession[] {
  const rows = db.prepare(
    "SELECT data FROM sessions WHERE json_extract(data, '$.projectId') = ?"
  ).all(projectId) as { data: string }[];
  return rows.map((r) => deserializeSession(r.data));
}

export function getEvents(): InterviewEvent[] {
  return db.prepare("SELECT token, event, dimension, detail, timestamp FROM events ORDER BY timestamp DESC LIMIT 1000")
    .all() as InterviewEvent[];
}

export function getEventsByProject(projectId: string): InterviewEvent[] {
  return db.prepare(`
    SELECT e.token, e.event, e.dimension, e.detail, e.timestamp
    FROM events e
    WHERE json_extract((SELECT data FROM sessions WHERE token = e.token), '$.projectId') = ?
    ORDER BY e.timestamp DESC
  `).all(projectId) as InterviewEvent[];
}


function questionFp(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яёçğışöü\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

export function isQuestionAlreadyAsked(session: InterviewSession, question: string): boolean {
  const qLower = question.toLowerCase().trim();
  const fp = questionFp(question);
  if (!fp || fp.length < 5) return false;
  if (session.askedQuestionFps.includes(fp)) return true;

  const normalized = qLower.replace(/\s+/g, " ");
  if (session.askedQuestionFps.includes(`full:${normalized}`)) return true;

  const assistantMessages = session.history
    .filter((m) => m.role === "assistant")
    .map((m) => m.content.toLowerCase().trim());

  if (assistantMessages.includes(qLower)) return true;
  const prefix = normalized.slice(0, 40);
  if (assistantMessages.some((m) => m.slice(0, 40) === prefix)) return true;

  const words = question.toLowerCase()
    .replace(/[^a-zа-яёçğışöü\s]/gi, "")
    .split(/\s+/)
    .filter((w) => w.length > 5);

  for (const prevMsg of assistantMessages) {
    const prevWords = prevMsg.replace(/[^a-zа-яёçğışöü\s]/gi, "").split(/\s+/).filter((w) => w.length > 5);
    const common = words.filter((w) => prevWords.includes(w));
    if (common.length / Math.max(words.length, prevWords.length) > 0.6) return true;
  }

  return false;
}

export function registerQuestion(session: InterviewSession, question: string): void {
  const fp = questionFp(question);
  if (fp && fp.length >= 5 && !session.askedQuestionFps.includes(fp)) {
    session.askedQuestionFps.push(fp);
  }
  const normalized = question.toLowerCase().trim().replace(/\s+/g, " ");
  const fullKey = `full:${normalized}`;
  if (!session.askedQuestionFps.includes(fullKey)) {
    session.askedQuestionFps.push(fullKey);
  }
}
