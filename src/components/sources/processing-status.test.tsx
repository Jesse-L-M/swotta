// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ProcessingStatus,
  UploadProgressBar,
} from "./processing-status";

describe("ProcessingStatus", () => {
  it("shows learner-facing detail for queued processing", () => {
    render(<ProcessingStatus status="queueing" showDescription />);

    expect(screen.getByText("Queued")).toBeTruthy();
    expect(
      screen.getByText(
        "The upload arrived. We are placing it into the processing queue now."
      )
    ).toBeTruthy();
  });

  it("shows actionable retry guidance for failed files", () => {
    render(
      <ProcessingStatus
        status="failed"
        errorMessage="Upload completed, but processing could not be queued"
        showDescription
      />
    );

    expect(screen.getByText("Needs another try")).toBeTruthy();
    expect(
      screen.getByText(
        "The file reached storage, but processing did not start cleanly. Upload it again to make a fresh attempt."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Problem: Upload completed, but processing could not be queued"
      )
    ).toBeTruthy();
  });
});

describe("UploadProgressBar", () => {
  it("shows uploaded state while queueing is being confirmed", () => {
    render(
      <UploadProgressBar
        filename="notes.pdf"
        progress={100}
        status="uploaded"
      />
    );

    expect(screen.getByText("Uploaded")).toBeTruthy();
    expect(
      screen.getByText(
        "The file upload finished. We are confirming the next processing step."
      )
    ).toBeTruthy();
  });

  it("shows retry copy for failed upload batches", () => {
    render(
      <UploadProgressBar
        filename="notes.pdf"
        progress={100}
        status="failed"
        errorMessage="Upload failed with status 403"
      />
    );

    expect(screen.getByText("Needs another try")).toBeTruthy();
    expect(
      screen.getByText("To retry, upload this file again to create a fresh attempt.")
    ).toBeTruthy();
  });
});
