# Interview Bot — Backend

Express + TypeScript API for the anonymous workplace interview bot. Deployed as a serverless function on Vercel, using Turso (libSQL) for persistence and OpenAI for LLM and voice.

## Stack

- **Runtime**: Node.js / TypeScript
- **Framework**: Express 5
- **Database**: Turso (libSQL) — hosted SQLite, serverless-compatible
- **LLM**: OpenAI (gpt-4o-mini by default)
- **STT/TTS**: OpenAI Whisper + TTS-1
- **Deployment**: Vercel (serverless)

## Local Setup

```bash
npm install
cp .env.example .env
# fill in your keys in .env
npm run dev
```

Server starts at `http://localhost:5000`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `OPENAI_MODEL` | No | Model name, defaults to `gpt-4o` |
| `LLM_BASE_URL` | No | Override OpenAI base URL |
| `TURSO_DATABASE_URL` | Yes | Turso database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Yes | Turso auth token |
| `PROXY_URL` | No | HTTP proxy for outbound requests |
| `MOCK_LLM` | No | Set to `true` to skip LLM calls (dev) |

## Scripts

```bash
npm run dev      # development with hot reload
npm run build    # compile TypeScript to dist/
npm run start    # run compiled output
```

## API Routes

### Survey

| Method | Path | Description |
|---|---|---|
| `POST` | `/survey/public-session` | Create a new interview session |
| `GET` | `/survey/:token` | Get session state |
| `POST` | `/survey/:token/language` | Set interview language |
| `POST` | `/survey/:token/demographics` | Submit demographics (if enabled) |
| `POST` | `/survey/:token/message` | Send a message, get reply |
| `POST` | `/survey/:token/message/stream` | Send a message, get SSE stream |
| `POST` | `/survey/:token/voice/transcribe` | Transcribe audio via Whisper |
| `POST` | `/survey/:token/voice/speak/stream` | Text-to-speech via OpenAI TTS |
| `GET` | `/survey/:token/report` | Individual session report |
| `POST` | `/survey/:token/silence-event` | Log silence telemetry event |

### Companies & Analytics

| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/companies` | List or create companies |
| `GET` | `/companies/:id` | Get company |
| `GET/POST` | `/companies/:id/projects` | List or create projects |
| `GET` | `/companies/:id/projects/:projectId/report` | Project analytics report |
| `GET` | `/companies/:id/projects/:projectId/sessions` | List sessions |
| `GET` | `/companies/:id/projects/:projectId/comparison` | Multi-interview comparison |
| `GET` | `/companies/:id/report` | Company-wide report |

## Deployment (Vercel)

1. Create a [Turso](https://turso.tech) database and generate a token
2. Add all env vars in Vercel project settings
3. Push to your repo — Vercel picks up `vercel.json` automatically

The database schema is created automatically on the first request.

## Architecture Notes

### Naming vs. Spec

Some external specs reference types/files that map to different names in this codebase. The concepts are equivalent:

| Spec term | This codebase | Location |
|---|---|---|
| `GuardAction` | `InputType` | `src/guards.ts` |
| `EventType` | `logEvent()` string literal | `src/session.ts` |
| `session-state.ts` | `src/types.ts` + `src/session.ts` | — |
| `classifyMessage()` | `classifyInput()` | `src/guards.ts` |
| `closingStage = "await_final"` | `session.finished = true` | `src/types.ts` |
| `currentMode = "ask_starter"` | implicit — starter question returned directly | `src/routes/survey.ts` |

### continue_request Flow

When a user says "давай дальше" / "let's continue" / "devam edelim":

1. `classifyInput()` returns `"continue_request"` (checked before `confusion` and `off_topic`)
2. `processMessage()` handles it without calling the LLM
3. If `session.finished = true` (closing stage) — resets to `INTERVIEW` state and resumes
4. Otherwise — marks current dimension complete, advances to next D, returns `starterQ`
5. Reply format: `"Окей, идём дальше.\n\n" + starterQ` (language-specific prefix)

### Silence Escalation

| Time | Action |
|---|---|
| 0–20s | Silent listening |
| 20s | Soft nudge via browser TTS ("Take your time") |
| 30s | Skip offer ("Would you like to move on?") |
| 40s | Auto-skip — sends `__skip__` to backend |

All silence events are logged via `POST /survey/:token/silence-event`.
