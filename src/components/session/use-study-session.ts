"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BlockType,
  AttemptOutcome,
  BlockId,
  SessionId,
} from "@/lib/types";

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export type SessionPhase =
  | "loading"
  | "confidence-before"
  | "active"
  | "streaming"
  | "completing"
  | "confidence-after"
  | "complete"
  | "error";

export interface SessionBlockInfo {
  id: string;
  topicName: string;
  blockType: BlockType;
  durationMinutes: number;
  reason: string;
}

export interface SessionResult {
  outcome: AttemptOutcome;
  summary: string;
}

export interface StudySessionApi {
  startSession: (blockId: string) => Promise<{
    sessionId: string;
    systemPrompt: string;
    initialMessage: string;
  }>;
  sendMessage: (
    sessionId: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    systemPrompt: string
  ) => Promise<ReadableStream<Uint8Array>>;
  endSession: (
    sessionId: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    systemPrompt: string,
    reason: "completed" | "abandoned" | "timeout"
  ) => Promise<{ outcome: AttemptOutcome; summary: string }>;
  fetchBlock: (blockId: string) => Promise<SessionBlockInfo>;
}

function defaultApi(): StudySessionApi {
  return {
    async fetchBlock(blockId: string): Promise<SessionBlockInfo> {
      const res = await fetch(`/api/blocks/${blockId}`);
      if (!res.ok) throw new Error(`Failed to fetch block: ${res.status}`);
      const { data } = (await res.json()) as { data: SessionBlockInfo };
      return data;
    },
    async startSession(blockId: string) {
      const res = await fetch("/api/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId }),
      });
      if (!res.ok)
        throw new Error(`Failed to start session: ${res.status}`);
      const { data } = (await res.json()) as {
        data: {
          sessionId: string;
          systemPrompt: string;
          initialMessage: string;
        };
      };
      return data;
    },
    async sendMessage(sessionId, messages, systemPrompt) {
      const res = await fetch(`/api/sessions/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, systemPrompt }),
      });
      if (!res.ok)
        throw new Error(`Failed to send message: ${res.status}`);
      if (!res.body)
        throw new Error("No response body for streaming");
      return res.body;
    },
    async endSession(sessionId, messages, systemPrompt, reason) {
      const res = await fetch(`/api/sessions/${sessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, systemPrompt, reason }),
      });
      if (!res.ok) throw new Error(`Failed to end session: ${res.status}`);
      const { data } = (await res.json()) as {
        data: { outcome: AttemptOutcome; summary: string };
      };
      return data;
    },
  };
}

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `msg-${messageCounter}-${Date.now()}`;
}

export function resetMessageCounter(): void {
  messageCounter = 0;
}

export interface UseStudySessionOptions {
  blockId: string;
  api?: StudySessionApi;
}

export interface UseStudySessionReturn {
  phase: SessionPhase;
  block: SessionBlockInfo | null;
  messages: SessionMessage[];
  isStreaming: boolean;
  sessionId: string | null;
  result: SessionResult | null;
  elapsedSeconds: number;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  error: string | null;
  submitConfidenceBefore: (value: number) => void;
  submitConfidenceAfter: (value: number) => void;
  sendMessage: (content: string) => Promise<void>;
  abandonSession: () => Promise<void>;
}

export function useStudySession({
  blockId,
  api,
}: UseStudySessionOptions): UseStudySessionReturn {
  const sessionApi = api ?? defaultApi();
  const apiRef = useRef(sessionApi);
  apiRef.current = sessionApi;

  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [block, setBlock] = useState<SessionBlockInfo | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [confidenceBefore, setConfidenceBefore] = useState<number | null>(null);
  const [confidenceAfter, setConfidenceAfter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load block info on mount
  useEffect(() => {
    let cancelled = false;
    async function loadBlock() {
      try {
        const blockInfo = await apiRef.current.fetchBlock(blockId);
        if (!cancelled) {
          setBlock(blockInfo);
          setPhase("confidence-before");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load block");
          setPhase("error");
        }
      }
    }
    void loadBlock();
    return () => {
      cancelled = true;
    };
  }, [blockId]);

  // Timer
  useEffect(() => {
    if (phase === "active" || phase === "streaming") {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedSeconds(
            Math.floor((Date.now() - startTimeRef.current) / 1000)
          );
        }
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return undefined;
  }, [phase]);

  const submitConfidenceBefore = useCallback(
    (value: number) => {
      setConfidenceBefore(value);
      setPhase("active");

      // Start the session
      void (async () => {
        try {
          const { sessionId: sid, systemPrompt: sp, initialMessage } =
            await apiRef.current.startSession(blockId);
          setSessionId(sid);
          setSystemPrompt(sp);
          setMessages([
            {
              id: nextMessageId(),
              role: "assistant",
              content: initialMessage,
              timestamp: new Date(),
            },
          ]);
        } catch (err: unknown) {
          setError(
            err instanceof Error ? err.message : "Failed to start session"
          );
          setPhase("error");
        }
      })();
    },
    [blockId]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || !systemPrompt || isStreaming) return;

      const userMsg: SessionMessage = {
        id: nextMessageId(),
        role: "user",
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setPhase("streaming");

      const assistantMsgId = nextMessageId();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        },
      ]);

      try {
        const apiMessages = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const stream = await apiRef.current.sendMessage(
          sessionId,
          apiMessages,
          systemPrompt
        );
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        abortRef.current = new AbortController();

        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (result.value) {
            const chunk = decoder.decode(result.value, { stream: !done });
            fullText += chunk;
            const currentText = fullText;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: currentText } : m
              )
            );
          }
        }

        // Check if session is complete (AI signalled completion)
        const hasComplete =
          /<session_status>complete<\/session_status>/.test(fullText);
        const cleanText = fullText
          .replace(/<session_status>complete<\/session_status>/g, "")
          .trim();

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: cleanText } : m
          )
        );

        if (hasComplete) {
          setPhase("completing");
          try {
            const allMessages = [
              ...messages,
              userMsg,
              { id: assistantMsgId, role: "assistant" as const, content: cleanText, timestamp: new Date() },
            ].map((m) => ({
              role: m.role,
              content: m.content,
            }));
            const endResult = await apiRef.current.endSession(
              sessionId,
              allMessages,
              systemPrompt,
              "completed"
            );
            setResult(endResult);
            setPhase("confidence-after");
          } catch (err: unknown) {
            setError(
              err instanceof Error ? err.message : "Failed to end session"
            );
            setPhase("error");
          }
        } else {
          setPhase("active");
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to send message"
        );
        // Remove the empty assistant message on error
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
        setPhase("active");
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [sessionId, systemPrompt, isStreaming, messages]
  );

  const submitConfidenceAfter = useCallback(
    (value: number) => {
      setConfidenceAfter(value);
      setPhase("complete");
    },
    []
  );

  const abandonSession = useCallback(async () => {
    if (!sessionId || !systemPrompt) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }

    setPhase("completing");
    try {
      const apiMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const endResult = await apiRef.current.endSession(
        sessionId,
        apiMessages,
        systemPrompt,
        "abandoned"
      );
      setResult(endResult);
      setPhase("complete");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to end session"
      );
      setPhase("error");
    }
  }, [sessionId, systemPrompt, messages]);

  return {
    phase,
    block,
    messages,
    isStreaming,
    sessionId,
    result,
    elapsedSeconds,
    confidenceBefore,
    confidenceAfter,
    error,
    submitConfidenceBefore,
    submitConfidenceAfter,
    sendMessage,
    abandonSession,
  };
}
