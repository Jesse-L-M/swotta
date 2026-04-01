"use client";

import {
  useStudySession,
  type StudySessionApi,
} from "./use-study-session";
import { ChatInterface } from "./chat-interface";
import { ConfidenceSlider } from "./confidence-slider";
import { SessionTimer } from "./session-timer";
import { ProgressIndicator } from "./progress-indicator";
import { SessionComplete } from "./session-complete";
import { SessionRecoveryCard } from "./session-recovery-card";
import { AiGuidanceCallout } from "./ai-guidance-callout";
import { Button } from "@/components/ui/button";
import { BLOCK_TYPE_LABELS } from "@/lib/labels";

export interface SessionViewProps {
  blockId: string;
  api?: StudySessionApi;
  onNextBlock?: () => void;
  onBackToDashboard?: () => void;
}

export function SessionView({
  blockId,
  api,
  onNextBlock,
  onBackToDashboard,
}: SessionViewProps) {
  const session = useStudySession({ blockId, api });

  if (session.phase === "loading" || session.phase === "starting") {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid="session-loading"
      >
        <div className="text-center">
          <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-muted border-t-teal-500" />
          <p className="text-sm text-muted-foreground">
            {session.phase === "starting"
              ? "Starting study session..."
              : "Loading study session..."}
          </p>
        </div>
      </div>
    );
  }

  if (session.phase === "error") {
    return (
      <div
        className="flex h-full items-center justify-center p-6"
        data-testid="session-error"
      >
        <div className="text-center">
          <p className="text-sm text-destructive">{session.error}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => void session.retry()}
              data-testid="error-retry-btn"
            >
              Retry
            </Button>
            {onBackToDashboard && (
              <Button
                variant="outline"
                onClick={onBackToDashboard}
                data-testid="error-dashboard-btn"
              >
                Back to Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (
    session.phase === "recovery" &&
    session.block &&
    session.recoveryState
  ) {
    return (
      <div className="flex h-full items-center justify-center p-6" data-testid="session-recovery">
        <SessionRecoveryCard
          topicName={session.block.topicName}
          statusLabel={session.recoveryState.statusLabel}
          title={session.recoveryState.title}
          description={session.recoveryState.description}
          summary={session.recoveryState.summary}
          actionLabel={session.recoveryState.actionLabel}
          onRestart={
            session.recoveryState.actionLabel
              ? () => void session.restartSession()
              : undefined
          }
          onBackToDashboard={onBackToDashboard}
        />
      </div>
    );
  }

  if (session.phase === "confidence-before" && session.block) {
    return (
      <div className="flex h-full flex-col" data-testid="session-confidence-before">
        <div className="border-b border-border p-4">
          <ProgressIndicator
            phase={session.phase}
            messagesCount={0}
            topicName={session.block.topicName}
            blockTypeLabel={BLOCK_TYPE_LABELS[session.block.blockType]}
          />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
          <AiGuidanceCallout blockType={session.block.blockType} />
          <ConfidenceSlider
            label="How confident do you feel?"
            description={`Rate your confidence on "${session.block.topicName}" before we begin.`}
            onSubmit={session.submitConfidenceBefore}
          />
        </div>
      </div>
    );
  }

  if (
    session.phase === "confidence-after" &&
    session.block &&
    session.result
  ) {
    return (
      <div className="flex h-full flex-col" data-testid="session-confidence-after">
        <div className="border-b border-border p-4">
          <ProgressIndicator
            phase={session.phase}
            messagesCount={session.messages.length}
            topicName={session.block.topicName}
            blockTypeLabel={BLOCK_TYPE_LABELS[session.block.blockType]}
          />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <ConfidenceSlider
            label="How confident do you feel now?"
            description={`Rate your confidence on "${session.block.topicName}" after completing the session.`}
            onSubmit={session.submitConfidenceAfter}
          />
        </div>
      </div>
    );
  }

  if (session.phase === "complete" && session.result) {
    return (
      <div className="flex h-full items-center justify-center p-6" data-testid="session-complete-view">
        <SessionComplete
          summary={session.result.summary}
          outcome={session.result.outcome}
          elapsedSeconds={session.elapsedSeconds}
          confidenceBefore={session.confidenceBefore}
          confidenceAfter={session.confidenceAfter}
          onNextBlock={onNextBlock}
          onBackToDashboard={onBackToDashboard}
        />
      </div>
    );
  }

  if (session.phase === "completing") {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid="session-completing"
      >
        <div className="text-center">
          <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-muted border-t-teal-500" />
          <p className="text-sm text-muted-foreground">
            Wrapping up your session...
          </p>
        </div>
      </div>
    );
  }

  // Active / streaming phase
  if (!session.block) return null;

  return (
    <div className="flex h-full flex-col" data-testid="session-active">
      <div className="space-y-3 border-b border-border p-4">
        <ProgressIndicator
          phase={session.phase}
          messagesCount={session.messages.length}
          topicName={session.block.topicName}
          blockTypeLabel={BLOCK_TYPE_LABELS[session.block.blockType]}
        />
        {session.resumeNotice ? (
          <div
            className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3"
            data-testid="session-resume-notice"
          >
            <p className="text-sm font-semibold text-teal-800">
              {session.resumeNotice.title}
            </p>
            <p className="mt-1 text-sm text-teal-700">
              {session.resumeNotice.description}
            </p>
          </div>
        ) : null}
        <SessionTimer
          elapsedSeconds={session.elapsedSeconds}
          durationMinutes={session.block.durationMinutes}
          blockType={session.block.blockType}
        />
      </div>

      <ChatInterface
        messages={session.messages}
        isStreaming={session.isStreaming}
        onSendMessage={(content) => void session.sendMessage(content)}
      />

      <div className="border-t border-border p-3 text-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void session.abandonSession()}
          disabled={session.isStreaming}
          data-testid="abandon-btn"
        >
          End session early
        </Button>
      </div>
    </div>
  );
}

export { BLOCK_TYPE_LABELS } from "@/lib/labels";
