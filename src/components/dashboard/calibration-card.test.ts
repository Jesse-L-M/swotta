import { describe, test, expect } from "vitest";
import type { CalibrationResult, TopicCalibration } from "@/engine/calibration";
import type { TopicId } from "@/lib/types";
import {
  getCalibrationAccent,
  getTrendLabel,
  findHighlightedTopic,
} from "./calibration-card";

function makeCalibration(
  overrides: Partial<CalibrationResult> = {}
): CalibrationResult {
  return {
    overconfident: false,
    underconfident: false,
    calibrationScore: 0,
    trend: "stable",
    message: "Well calibrated.",
    topicCalibrations: [],
    dataPoints: 5,
    ...overrides,
  };
}

function makeTopic(
  overrides: Partial<TopicCalibration> = {}
): TopicCalibration {
  return {
    topicId: "topic-1" as TopicId,
    topicName: "Genetics",
    calibrationScore: 0,
    overconfident: false,
    underconfident: false,
    dataPoints: 3,
    message: "Well calibrated on Genetics.",
    ...overrides,
  };
}

describe("getCalibrationAccent", () => {
  test("returns neutral when no data points", () => {
    expect(getCalibrationAccent(makeCalibration({ dataPoints: 0 }))).toBe(
      "neutral"
    );
  });

  test("returns teal when underconfident", () => {
    expect(
      getCalibrationAccent(makeCalibration({ underconfident: true }))
    ).toBe("teal");
  });

  test("returns coral when overconfident", () => {
    expect(
      getCalibrationAccent(makeCalibration({ overconfident: true }))
    ).toBe("coral");
  });

  test("returns neutral when well calibrated", () => {
    expect(getCalibrationAccent(makeCalibration())).toBe("neutral");
  });

  test("prefers underconfident over overconfident when both true", () => {
    expect(
      getCalibrationAccent(
        makeCalibration({ underconfident: true, overconfident: true })
      )
    ).toBe("teal");
  });
});

describe("getTrendLabel", () => {
  test("returns correct label for improving", () => {
    expect(getTrendLabel("improving")).toBe("Calibration improving");
  });

  test("returns correct label for declining", () => {
    expect(getTrendLabel("declining")).toBe("Calibration declining");
  });

  test("returns correct label for stable", () => {
    expect(getTrendLabel("stable")).toBe("Calibration stable");
  });
});

describe("findHighlightedTopic", () => {
  test("returns null for empty array", () => {
    expect(findHighlightedTopic([])).toBeNull();
  });

  test("returns null when all topics have insufficient data", () => {
    const topics = [
      makeTopic({ dataPoints: 1 }),
      makeTopic({ topicId: "t-2" as TopicId, dataPoints: 0 }),
    ];
    expect(findHighlightedTopic(topics)).toBeNull();
  });

  test("returns null when no topics are miscalibrated", () => {
    const topics = [
      makeTopic({
        dataPoints: 5,
        overconfident: false,
        underconfident: false,
        calibrationScore: 0.05,
      }),
    ];
    expect(findHighlightedTopic(topics)).toBeNull();
  });

  test("returns the most miscalibrated underconfident topic", () => {
    const topics = [
      makeTopic({
        topicId: "t-1" as TopicId,
        topicName: "Genetics",
        calibrationScore: -0.2,
        underconfident: true,
        dataPoints: 4,
      }),
      makeTopic({
        topicId: "t-2" as TopicId,
        topicName: "Ecology",
        calibrationScore: -0.4,
        underconfident: true,
        dataPoints: 3,
      }),
    ];
    const result = findHighlightedTopic(topics);
    expect(result).not.toBeNull();
    expect(result!.topicName).toBe("Ecology");
  });

  test("returns the most miscalibrated overconfident topic", () => {
    const topics = [
      makeTopic({
        topicId: "t-1" as TopicId,
        topicName: "Genetics",
        calibrationScore: 0.3,
        overconfident: true,
        dataPoints: 4,
      }),
      makeTopic({
        topicId: "t-2" as TopicId,
        topicName: "Ecology",
        calibrationScore: 0.15,
        overconfident: true,
        dataPoints: 3,
      }),
    ];
    const result = findHighlightedTopic(topics);
    expect(result).not.toBeNull();
    expect(result!.topicName).toBe("Genetics");
  });

  test("compares absolute calibration scores across under/overconfident", () => {
    const topics = [
      makeTopic({
        topicId: "t-1" as TopicId,
        topicName: "Genetics",
        calibrationScore: -0.5,
        underconfident: true,
        dataPoints: 4,
      }),
      makeTopic({
        topicId: "t-2" as TopicId,
        topicName: "Ecology",
        calibrationScore: 0.3,
        overconfident: true,
        dataPoints: 3,
      }),
    ];
    const result = findHighlightedTopic(topics);
    expect(result!.topicName).toBe("Genetics");
  });

  test("ignores well-calibrated topics even with enough data", () => {
    const topics = [
      makeTopic({
        topicId: "t-1" as TopicId,
        topicName: "Genetics",
        calibrationScore: 0.02,
        overconfident: false,
        underconfident: false,
        dataPoints: 10,
      }),
      makeTopic({
        topicId: "t-2" as TopicId,
        topicName: "Ecology",
        calibrationScore: -0.2,
        underconfident: true,
        dataPoints: 3,
      }),
    ];
    const result = findHighlightedTopic(topics);
    expect(result!.topicName).toBe("Ecology");
  });

  test("ignores miscalibrated topics with insufficient data", () => {
    const topics = [
      makeTopic({
        topicId: "t-1" as TopicId,
        topicName: "Genetics",
        calibrationScore: -0.8,
        underconfident: true,
        dataPoints: 1,
      }),
      makeTopic({
        topicId: "t-2" as TopicId,
        topicName: "Ecology",
        calibrationScore: -0.2,
        underconfident: true,
        dataPoints: 3,
      }),
    ];
    const result = findHighlightedTopic(topics);
    expect(result!.topicName).toBe("Ecology");
  });
});
