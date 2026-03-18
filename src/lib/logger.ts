export function structuredLog(
  event: string,
  data: Record<string, unknown>
): void {
  if (process.env.NODE_ENV !== "test") {
    process.stderr.write(
      JSON.stringify({ event, ...data, ts: new Date().toISOString() }) + "\n"
    );
  }
}
