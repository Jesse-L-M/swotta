"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
} from "@/components/diagnostic";

function DiagnosticPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const qualificationVersionId = searchParams.get("qualificationVersionId");

  const [phase, setPhase] = useState<DiagnosticPhase>("intro");
  const [qualificationName, setQualificationName] = useState("");
  const [topics, setTopics] = useState<DiagnosticTopic[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingMessage, setPendingMessage] = useState<ChatMessage | null>(null);
  const [progress, setProgress] = useState<DiagnosticProgress>({
    explored: [],
    current: null,
    total: 0,
    isComplete: false,
  });
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [continuePath, setContinuePath] = useState("/dashboard");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPhase("intro");
    setQualificationName("");
    setTopics([]);
    setMessages([]);
    setPendingMessage(null);
    setProgress({
      explored: [],
      current: null,
      total: 0,
      isComplete: false,
    });
    setResults([]);
    setInput("");
    setLoading(false);
    setError(null);
    setIsComplete(false);
    setContinuePath("/dashboard");
  }, [qualificationVersionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingMessage, loading]);

  const apiCall = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        data?: Record<string, unknown>;
        error?: { message: string };
      };
      if (!res.ok) {
        throw new Error(
          json.error?.message ?? `Request failed (${res.status})`
        );
      }
      return json.data;
    },
    []
  );

  async function handleStart() {
    if (!qualificationVersionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall({
        action: "start",
        qualificationVersionId,
      });
      if (!data) throw new Error("No data returned");
      setQualificationName(data.qualificationName as string);
      setTopics(data.topics as DiagnosticTopic[]);
      setProgress(data.progress as DiagnosticProgress);
      setPendingMessage(null);
      setIsComplete(false);
      setContinuePath("/dashboard");
      setMessages([
        { role: "user", content: "I'm ready to start the diagnostic." },
        { role: "assistant", content: data.reply as string },
      ]);
      setPhase("chat");
    } catch (err: unknown) {
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
      setError(
        err instanceof Error ? err.message : "Failed to analyse responses"
      );
      setPhase("chat");
    }
  }

  async function handleSkip() {
    if (!qualificationVersionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall({
        action: "skip",
        qualificationVersionId,
      });
      router.push((data?.nextPath as string | undefined) ?? "/dashboard");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to skip diagnostic"
      );
    } finally {
      setLoading(false);
    }
  }

  if (!qualificationVersionId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-[#5C5950]">
          No qualification specified. Please return to your dashboard.
        </p>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <IntroScreen
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
        qualificationName={qualificationName}
        onContinue={() => router.push(continuePath)}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <ChatHeader
        qualificationName={qualificationName}
        progress={progress}
        topicCount={topics.length}
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

export default function DiagnosticPageClient() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <DiagnosticPageContent />
    </Suspense>
  );
}
