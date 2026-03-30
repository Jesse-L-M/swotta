"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  IntroScreen,
  ChatHeader,
  MessageBubble,
  ChatInput,
  AnalysingScreen,
  MasteryReveal,
} from "@/components/diagnostic";
import type {
  DiagnosticTopic,
  DiagnosticProgress,
  DiagnosticResult,
  ChatMessage,
  DiagnosticPhase,
  DiagnosticContinueStep,
  DiagnosticIntroMode,
} from "@/components/diagnostic";

interface DiagnosticPageClientProps {
  qualificationVersionId: string;
  qualificationLabel: string;
  remainingPendingCount: number;
}

type DiagnosticApiResponse = {
  data?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
  };
};

class DiagnosticApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, options: { code?: string; status: number }) {
    super(message);
    this.name = "DiagnosticApiError";
    this.code = options.code;
    this.status = options.status;
  }
}

function buildEmptyProgress(): DiagnosticProgress {
  return {
    explored: [],
    current: null,
    total: 0,
    isComplete: false,
  };
}

function getContinueStep(nextPath: string): DiagnosticContinueStep {
  return nextPath.startsWith("/diagnostic?")
    ? "diagnostic"
    : "dashboard";
}

function DiagnosticPageContent({
  qualificationVersionId,
  qualificationLabel,
  remainingPendingCount,
}: DiagnosticPageClientProps) {
  const router = useRouter();

  const [phase, setPhase] = useState<DiagnosticPhase>("intro");
  const [topics, setTopics] = useState<DiagnosticTopic[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingMessage, setPendingMessage] = useState<ChatMessage | null>(null);
  const [progress, setProgress] = useState<DiagnosticProgress>(
    buildEmptyProgress
  );
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [introMode, setIntroMode] = useState<DiagnosticIntroMode>("start");
  const [continuePath, setContinuePath] = useState("/dashboard");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const resetConversation = useCallback(
    (options: { error?: string | null; introMode?: DiagnosticIntroMode } = {}) => {
      setPhase("intro");
      setTopics([]);
      setMessages([]);
      setPendingMessage(null);
      setProgress(buildEmptyProgress());
      setResults([]);
      setInput("");
      setLoading(false);
      setError(options.error ?? null);
      setIsComplete(false);
      setIntroMode(options.introMode ?? "start");
      setContinuePath("/dashboard");
    },
    []
  );

  useEffect(() => {
    resetConversation();
  }, [qualificationVersionId, resetConversation]);

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, pendingMessage, loading]);

  const apiCall = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as DiagnosticApiResponse;
      if (!res.ok) {
        throw new DiagnosticApiError(
          json.error?.message ?? `Request failed (${res.status})`,
          {
            code: json.error?.code,
            status: res.status,
          }
        );
      }
      return json.data;
    },
    []
  );

  const routeToFlowFallback = useCallback(() => {
    router.replace("/dashboard");
  }, [router]);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall({
        action: "start",
        qualificationVersionId,
      });
      if (!data) throw new Error("No data returned");
      setTopics(data.topics as DiagnosticTopic[]);
      setProgress(data.progress as DiagnosticProgress);
      setPendingMessage(null);
      setIsComplete(false);
      setIntroMode("start");
      setContinuePath("/dashboard");
      setMessages([
        { role: "user", content: "I'm ready to start the diagnostic." },
        { role: "assistant", content: data.reply as string },
      ]);
      setPhase("chat");
    } catch (err: unknown) {
      if (err instanceof DiagnosticApiError) {
        if (
          err.code === "DIAGNOSTIC_ALREADY_RESOLVED" ||
          err.code === "NOT_ENROLLED"
        ) {
          routeToFlowFallback();
          return;
        }
      }
      setError(
        err instanceof Error ? err.message : "Failed to start diagnostic"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setPendingMessage(userMessage);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const data = await apiCall({
        action: "message",
        qualificationVersionId,
        messages: updatedMessages,
      });
      if (!data) throw new Error("No data returned");
      const reply = data.reply as string;
      const newProgress = data.progress as DiagnosticProgress;
      const complete = data.isComplete as boolean;

      setPendingMessage(null);
      setMessages([...updatedMessages, { role: "assistant", content: reply }]);
      setProgress(newProgress);
      setIsComplete(complete);
    } catch (err: unknown) {
      setPendingMessage(null);
      setInput(text);
      if (err instanceof DiagnosticApiError) {
        if (err.code === "INVALID_DIAGNOSTIC_STATE") {
          resetConversation({
            error: err.message,
            introMode: "restart",
          });
          return;
        }
        if (
          err.code === "DIAGNOSTIC_ALREADY_RESOLVED" ||
          err.code === "NOT_ENROLLED"
        ) {
          routeToFlowFallback();
          return;
        }
      }
      setError(
        err instanceof Error ? err.message : "Failed to send message"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    setPhase("analysing");
    setError(null);
    try {
      const data = await apiCall({
        action: "complete",
        qualificationVersionId,
        messages,
      });
      if (!data) throw new Error("No data returned");
      setResults(data.results as DiagnosticResult[]);
      setContinuePath((data.nextPath as string | undefined) ?? "/dashboard");
      setPhase("complete");
    } catch (err: unknown) {
      if (err instanceof DiagnosticApiError) {
        if (err.code === "INVALID_DIAGNOSTIC_STATE") {
          resetConversation({
            error: err.message,
            introMode: "restart",
          });
          return;
        }
        if (
          err.code === "DIAGNOSTIC_ALREADY_RESOLVED" ||
          err.code === "NOT_ENROLLED"
        ) {
          routeToFlowFallback();
          return;
        }
      }
      setError(
        err instanceof Error ? err.message : "Failed to analyse responses"
      );
      setPhase("chat");
    }
  }

  async function handleSkip() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall({
        action: "skip",
        qualificationVersionId,
      });
      router.push((data?.nextPath as string | undefined) ?? "/dashboard");
    } catch (err: unknown) {
      if (err instanceof DiagnosticApiError) {
        if (
          err.code === "DIAGNOSTIC_ALREADY_RESOLVED" ||
          err.code === "NOT_ENROLLED"
        ) {
          routeToFlowFallback();
          return;
        }
      }
      setError(
        err instanceof Error ? err.message : "Failed to skip diagnostic"
      );
    } finally {
      setLoading(false);
    }
  }

  if (phase === "intro") {
    return (
      <IntroScreen
        qualificationLabel={qualificationLabel}
        remainingPendingCount={remainingPendingCount}
        mode={introMode}
        onStart={handleStart}
        onSkip={handleSkip}
        loading={loading}
        error={error}
      />
    );
  }

  if (phase === "analysing") {
    return <AnalysingScreen />;
  }

  if (phase === "complete") {
    return (
      <MasteryReveal
        results={results}
        qualificationLabel={qualificationLabel}
        remainingPendingCount={remainingPendingCount}
        nextStep={getContinueStep(continuePath)}
        onContinue={() => router.push(continuePath)}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <ChatHeader
        qualificationLabel={qualificationLabel}
        progress={progress}
        topicCount={topics.length}
        remainingPendingCount={remainingPendingCount}
      />

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {pendingMessage && <MessageBubble message={pendingMessage} />}
          {loading && (
            <div className="flex items-center gap-2 text-[#949085]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#2D7A6E]" />
              <span className="text-[0.875rem]">Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {error && (
        <div className="border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3 text-[0.875rem] text-[#D4654A]">
          {error}
        </div>
      )}

      {isComplete ? (
        <div className="border-t border-[#E5E0D6] bg-white px-4 py-4">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-[0.875rem] text-[#5C5950]">
              All topics explored. Ready to see your knowledge map?
            </p>
            <button
              onClick={handleComplete}
              className="rounded-[8px] bg-[#2D7A6E] px-6 py-2.5 text-[0.875rem] font-medium text-white transition-colors duration-150 hover:bg-[#256b60]"
              data-testid="see-results-btn"
            >
              See my results
            </button>
          </div>
        </div>
      ) : (
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          loading={loading}
        />
      )}
    </div>
  );
}

export default function DiagnosticPageClient(props: DiagnosticPageClientProps) {
  return <DiagnosticPageContent {...props} />;
}
