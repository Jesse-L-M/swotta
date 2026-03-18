"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface DiagnosticTopic {
  id: string;
  name: string;
  code: string | null;
}

interface DiagnosticProgress {
  explored: string[];
  current: string | null;
  total: number;
  isComplete: boolean;
}

interface DiagnosticResult {
  topicId: string;
  topicName: string;
  score: number;
  confidence: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type Phase = "intro" | "chat" | "analysing" | "complete";

export default function DiagnosticPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const qualificationVersionId = searchParams.get("qualificationVersionId");

  const [phase, setPhase] = useState<Phase>("intro");
  const [qualificationName, setQualificationName] = useState("");
  const [topics, setTopics] = useState<DiagnosticTopic[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [systemPrompt, setSystemPrompt] = useState("");
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (phase === "chat" && !loading) {
      inputRef.current?.focus();
    }
  }, [phase, loading, messages]);

  const apiCall = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { data?: Record<string, unknown>; error?: { message: string } };
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
      setSystemPrompt(data.systemPrompt as string);
      setQualificationName(data.qualificationName as string);
      setTopics(data.topics as DiagnosticTopic[]);
      setProgress(data.progress as DiagnosticProgress);
      setMessages([
        { role: "user", content: "I'm ready to start the diagnostic." },
        { role: "assistant", content: data.reply as string },
      ]);
      setPhase("chat");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start diagnostic");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const data = await apiCall({
        action: "message",
        qualificationVersionId,
        systemPrompt,
        messages: updatedMessages,
      });
      if (!data) throw new Error("No data returned");
      const reply = data.reply as string;
      const newProgress = data.progress as DiagnosticProgress;
      const complete = data.isComplete as boolean;

      setMessages([...updatedMessages, { role: "assistant", content: reply }]);
      setProgress(newProgress);
      setIsComplete(complete);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message");
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
      setPhase("complete");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to analyse responses");
      setPhase("chat");
    }
  }

  async function handleSkip() {
    if (!qualificationVersionId) return;
    setLoading(true);
    setError(null);
    try {
      await apiCall({
        action: "skip",
        qualificationVersionId,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to skip diagnostic");
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
    return <IntroScreen onStart={handleStart} onSkip={handleSkip} loading={loading} error={error} />;
  }

  if (phase === "analysing") {
    return <AnalysingScreen />;
  }

  if (phase === "complete") {
    return (
      <CompleteScreen
        results={results}
        qualificationName={qualificationName}
        onContinue={() => router.push("/dashboard")}
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
          {loading && (
            <div className="flex items-center gap-2 text-[#949085]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#2D7A6E]" />
              <span className="text-sm">Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {error && (
        <div className="border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3 text-sm text-[#D4654A]">
          {error}
        </div>
      )}

      {isComplete ? (
        <div className="border-t border-[#E5E0D6] bg-white px-4 py-4">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-sm text-[#5C5950]">
              All topics explored. Ready to see your knowledge map?
            </p>
            <button
              onClick={handleComplete}
              className="rounded-[8px] bg-[#2D7A6E] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#256b60]"
            >
              See my results
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSend}
          className="border-t border-[#E5E0D6] bg-white px-4 py-4"
        >
          <div className="mx-auto flex max-w-2xl gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="Type your response..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none rounded-[8px] border border-[#E5E0D6] bg-white px-4 py-2.5 text-[#1A1917] placeholder:text-[#949085] focus:border-[#2D7A6E] focus:outline-none focus:ring-1 focus:ring-[#2D7A6E] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-[8px] bg-[#2D7A6E] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#256b60] disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function IntroScreen({
  onStart,
  onSkip,
  loading,
  error,
}: {
  onStart: () => void;
  onSkip: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      <div className="max-w-lg text-center">
        <h1 className="font-[family-name:var(--font-serif)] text-3xl text-[#1A1917]">
          Let&apos;s see what you already know
        </h1>
        <p className="mt-4 text-[#5C5950] leading-relaxed">
          Before we build your study plan, we&apos;ll have a quick chat about
          each major topic area. This helps Swotta understand where you&apos;re
          strong and where to focus your study time.
        </p>
        <p className="mt-3 text-sm text-[#949085]">
          Takes about 10-15 minutes. No wrong answers.
        </p>

        {error && (
          <div className="mt-4 rounded-[8px] border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3 text-left text-sm text-[#D4654A]">
            {error}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            onClick={onStart}
            disabled={loading}
            className="rounded-[8px] bg-[#2D7A6E] px-8 py-3 text-base font-medium text-white transition-colors hover:bg-[#256b60] disabled:opacity-50"
          >
            {loading ? "Starting..." : "Start diagnostic"}
          </button>
          <button
            onClick={onSkip}
            disabled={loading}
            className="text-sm text-[#949085] underline-offset-2 transition-colors hover:text-[#5C5950] hover:underline"
          >
            Skip for now
          </button>
          <p className="mt-1 max-w-xs text-xs text-[#949085]">
            You can skip, but all topics will start at zero mastery.
            The diagnostic helps us personalise from day one.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChatHeader({
  qualificationName,
  progress,
  topicCount,
}: {
  qualificationName: string;
  progress: DiagnosticProgress;
  topicCount: number;
}) {
  const total = progress.total || topicCount;
  const explored = progress.explored.length;
  const percent = total > 0 ? Math.round((explored / total) * 100) : 0;

  return (
    <div className="border-b border-[#E5E0D6] bg-white px-4 py-3">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-serif)] text-lg text-[#1A1917]">
              {qualificationName} Diagnostic
            </h2>
            <p className="text-sm text-[#949085]">
              {explored === 0
                ? "Getting started..."
                : explored >= total
                  ? `All ${total} topics explored`
                  : progress.current
                    ? `Exploring: ${progress.current}`
                    : `${explored} of ${total} topics explored`}
            </p>
          </div>
          <span className="text-sm font-medium text-[#2D7A6E]">
            {explored}/{total}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F0ECE4]">
          <div
            className="h-full rounded-full bg-[#2D7A6E] transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-[12px] px-4 py-3 ${
          isUser
            ? "bg-[#E4F0ED] text-[#1A1917]"
            : "bg-white text-[#1A1917] shadow-[0_1px_3px_rgba(26,25,23,0.05)]"
        }`}
      >
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  );
}

function AnalysingScreen() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-[3px] border-[#F0ECE4] border-t-[#2D7A6E]" />
        <h2 className="font-[family-name:var(--font-serif)] text-2xl text-[#1A1917]">
          Analysing your responses
        </h2>
        <p className="mt-2 text-[#5C5950]">
          Building your personalised knowledge map...
        </p>
      </div>
    </div>
  );
}

function CompleteScreen({
  results,
  qualificationName,
  onContinue,
}: {
  results: DiagnosticResult[];
  qualificationName: string;
  onContinue: () => void;
}) {
  const sorted = [...results].sort((a, b) => b.score - a.score);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="font-[family-name:var(--font-serif)] text-3xl text-[#1A1917]">
          Your knowledge map
        </h1>
        <p className="mt-2 text-[#5C5950]">
          Here&apos;s where you stand in {qualificationName}. Swotta will build
          your study plan based on these results.
        </p>
      </div>

      <div className="space-y-3">
        {sorted.map((result) => (
          <TopicResultBar key={result.topicId} result={result} />
        ))}
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={onContinue}
          className="rounded-[8px] bg-[#2D7A6E] px-8 py-3 text-base font-medium text-white transition-colors hover:bg-[#256b60]"
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}

function TopicResultBar({ result }: { result: DiagnosticResult }) {
  const percent = Math.round(result.score * 100);
  const barColor =
    result.score >= 0.7
      ? "#2D7A6E"
      : result.score >= 0.4
        ? "#949085"
        : result.score > 0
          ? "#D4654A"
          : "#F0ECE4";

  const label =
    result.score >= 0.7
      ? "Strong"
      : result.score >= 0.4
        ? "Developing"
        : result.score > 0
          ? "Needs work"
          : "Not covered";

  return (
    <div className="rounded-[12px] bg-white p-4 shadow-[0_1px_3px_rgba(26,25,23,0.05)]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#1A1917]">
          {result.topicName}
        </span>
        <span
          className="text-xs font-medium"
          style={{ color: barColor === "#F0ECE4" ? "#949085" : barColor }}
        >
          {label}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#F0ECE4]">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.max(percent, 2)}%`, backgroundColor: barColor }}
        />
      </div>
      <div className="mt-1 text-right text-xs text-[#949085]">{percent}%</div>
    </div>
  );
}
