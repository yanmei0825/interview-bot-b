export type Language = "ru" | "en" | "tr";

export type DimensionKey =
  | "D1" | "D2" | "D3" | "D4" | "D5"
  | "D6" | "D7" | "D8" | "D9" | "D10";

export interface Company {
  id: string;
  name: string;
  createdAt: number;
}

export interface Project {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  demographicsEnabled: boolean;
  allowedLanguages: Language[];
  createdAt: number;
}

export interface Demographics {
  fullName?: string;
  department?: string;
  position?: string;
  [key: string]: string | undefined;
}

export interface Message {
  role: "assistant" | "user";
  content: string;
  timestamp: number;
}

export type InterviewState =
  | "INIT"
  | "LANGUAGE_SELECTED"
  | "DEMOGRAPHICS"
  | "INTERVIEW"
  | "COMPLETE";

export interface DimensionCoverage {
  key: DimensionKey;
  covered: boolean;
  turnCount: number;   
  signals: string[];   
 
  depthLevel: number;  
  coverageScore: number; 
}

export interface InterviewSession {
  token: string;
  projectId: string;
  language: Language | null;
  demographicsEnabled: boolean;
  demographics: Demographics | null;
  demographicsSubmitted: boolean;
  started: boolean;
  finished: boolean;
  state: InterviewState;
  currentDimension: DimensionKey;
  dimensionIndex: number;
  coverage: Record<DimensionKey, DimensionCoverage>;
  history: Message[];
  turnCount: number;
  questionCount: number;
  askedQuestionFps: string[]; 
  createdAt: number;
  lastActivityAt: number;
}

export interface InterviewEvent {
  token: string;
  event: string;
  dimension?: DimensionKey;
  detail?: string;
  timestamp: number;
}
