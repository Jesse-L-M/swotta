# TODOs

## Image OCR via Gemini Pro 3 on Vertex AI

**What:** Add image mime type support (PNG, JPG, HEIC) to `defaultExtractText` in `src/engine/ingestion.ts` using Google Vertex AI's Gemini Pro 3 model for OCR.

**Why:** Students upload photos of handwritten notes, screenshots of slides, and scanned worksheets. The architecture spec (`docs/ARCHITECTURE.md`) lists "Images: Claude vision" as part of the ingestion flow, but the preferred model is Gemini Pro 3 due to superior OCR capabilities.

**Approach:** Use `@google-cloud/vertexai` SDK. Add a new branch in `defaultExtractText` for image/* mime types. Send the image buffer to Gemini Pro 3 with a prompt to extract all text content, preserving structure (headings, lists, equations).

**Depends on:** GCP infrastructure setup (Task 3.1) for Vertex AI API access and credentials. The project already uses GCP (Cloud Run, Cloud SQL, Cloud Storage), so Vertex AI fits naturally.

**Added:** 2026-03-18 via /plan-eng-review on branch Jesse-L-M/ingestion-pipeline.
