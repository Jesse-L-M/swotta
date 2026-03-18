export interface DiagnosticTopic {
  id: string;
  name: string;
  code: string | null;
}

export interface DiagnosticProgress {
  explored: string[];
  current: string | null;
  total: number;
  isComplete: boolean;
}

export interface DiagnosticResult {
  topicId: string;
  topicName: string;
  score: number;
  confidence: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type DiagnosticPhase = "intro" | "chat" | "analysing" | "complete";
