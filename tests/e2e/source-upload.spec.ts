import { test, expect } from "@playwright/test";
import { authenticateAsStudent } from "./helpers/auth";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

/**
 * Create a temporary test file for upload testing.
 * Returns the path to the created file.
 */
function createTestFile(filename: string, content: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "swotta-e2e-"));
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function cleanupTestFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
    fs.rmdirSync(path.dirname(filePath));
  } catch {
    // Ignore cleanup errors — temp dir may already be removed
  }
}

test.describe("Source upload flow", () => {
  const tempFiles: string[] = [];

  test.beforeEach(async ({ page }) => {
    await authenticateAsStudent(page);
  });

  test.afterEach(() => {
    for (const f of tempFiles) {
      cleanupTestFile(f);
    }
    tempFiles.length = 0;
  });

  test("sources page shows empty state with upload CTA", async ({ page }) => {
    await page.goto("/sources");

    // Page heading
    await expect(page.getByText("Sources")).toBeVisible();
    await expect(
      page.getByText("Keep track of what has uploaded")
    ).toBeVisible();

    // Empty state
    await expect(page.getByText("Build your sources library")).toBeVisible();
    await expect(
      page.getByText(/store them, queue them for processing/)
    ).toBeVisible();

    // Upload buttons
    await expect(
      page.getByRole("link", { name: "Upload files" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Upload your first file" })
    ).toBeVisible();
  });

  test("navigates from sources to upload page", async ({ page }) => {
    await page.goto("/sources");

    await page.getByRole("link", { name: "Upload files" }).click();
    await expect(page).toHaveURL(/\/sources\/upload/);

    // Upload page heading
    await expect(page.getByText("Upload Materials")).toBeVisible();
    await expect(
      page.getByText(/keep their status clear while the background work finishes/)
    ).toBeVisible();
  });

  test("completes full upload flow: name collection, select files, see progress, see completion", async ({
    page,
  }) => {
    await page.goto("/sources/upload");

    // Step 1: Collection name + file selection
    await expect(page.getByText("Upload Materials")).toBeVisible();

    // Enter collection name
    const collectionInput = page.locator("#collectionName");
    await collectionInput.fill("Biology Revision Notes");

    // Upload dropzone should be visible
    await expect(
      page.getByText("Drag and drop files here")
    ).toBeVisible();
    await expect(page.getByText(/PDF and DOCX/)).toBeVisible();

    // Create a test PDF file and trigger upload via the hidden file input
    const testFile = createTestFile(
      "cell-biology-notes.pdf",
      "%PDF-1.4 test content for cell biology revision notes"
    );
    tempFiles.push(testFile);

    // Set files on the hidden input (bypasses the dropzone click)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Step 2: Upload progress
    await expect(page.getByText("Upload Progress")).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByText("cell-biology-notes.pdf")
    ).toBeVisible();

    // Progress bar should show (simulated upload progress)
    // Wait for upload to complete (simulated — takes ~2-4 seconds)
    await expect(page.getByText("Upload more")).toBeVisible({
      timeout: 15_000,
    });

    // Step 3: Completion — topic mapping preview and navigation buttons
    await expect(
      page.getByRole("link", { name: "View sources" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upload more" })
    ).toBeVisible();
  });

  test("upload more button resets to file selection", async ({ page }) => {
    await page.goto("/sources/upload");

    // Upload a file to get to completion
    const testFile = createTestFile(
      "chemistry-notes.pdf",
      "%PDF-1.4 test chemistry content"
    );
    tempFiles.push(testFile);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Wait for completion
    await expect(page.getByText("Upload more")).toBeVisible({
      timeout: 15_000,
    });

    // Click "Upload more"
    await page.getByRole("button", { name: "Upload more" }).click();

    // Should return to file selection step
    await expect(
      page.getByText("Drag and drop files here")
    ).toBeVisible();
  });

  test("multiple files upload with individual progress bars", async ({
    page,
  }) => {
    await page.goto("/sources/upload");

    // Create two test files
    const file1 = createTestFile(
      "biology-paper1.pdf",
      "%PDF-1.4 biology paper 1"
    );
    const file2 = createTestFile(
      "biology-paper2.pdf",
      "%PDF-1.4 biology paper 2"
    );
    tempFiles.push(file1, file2);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([file1, file2]);

    // Both files should show in progress
    await expect(page.getByText("Upload Progress")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("biology-paper1.pdf")).toBeVisible();
    await expect(page.getByText("biology-paper2.pdf")).toBeVisible();

    // Wait for both to complete
    await expect(page.getByText("Upload more")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("back to sources link works", async ({ page }) => {
    await page.goto("/sources/upload");

    await expect(page.getByText("Back to sources")).toBeVisible();
    await page.getByText("Back to sources").click();

    await expect(page).toHaveURL(/\/sources$/);
  });
});
