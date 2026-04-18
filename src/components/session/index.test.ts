// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import * as session from "./index";

describe("session barrel export", () => {
  it("exports SessionView", () => {
    expect(session.SessionView).toBeDefined();
  });

  it("exports ChatInterface", () => {
    expect(session.ChatInterface).toBeDefined();
  });

  it("exports MessageBubble", () => {
    expect(session.MessageBubble).toBeDefined();
  });

  it("exports ConfidenceSlider", () => {
    expect(session.ConfidenceSlider).toBeDefined();
  });

  it("exports SessionTimer", () => {
    expect(session.SessionTimer).toBeDefined();
  });

  it("exports ProgressIndicator", () => {
    expect(session.ProgressIndicator).toBeDefined();
  });

  it("exports SessionComplete", () => {
    expect(session.SessionComplete).toBeDefined();
  });

  it("exports SessionRecoveryCard", () => {
    expect(session.SessionRecoveryCard).toBeDefined();
  });

  it("exports AiGuidanceCallout", () => {
    expect(session.AiGuidanceCallout).toBeDefined();
  });

  it("exports useStudySession", () => {
    expect(session.useStudySession).toBeDefined();
  });
});
