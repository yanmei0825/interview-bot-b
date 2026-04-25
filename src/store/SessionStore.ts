import { InterviewSession } from "../types";

export interface SessionStore {
  get(token: string): Promise<InterviewSession | undefined>;
  set(token: string, session: InterviewSession): Promise<void>;
  delete(token: string): Promise<void>;
  extendTTL(token: string, ttlSeconds: number): Promise<void>;
}
