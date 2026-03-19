/**
 * Structured logging with context prefixes.
 */
export function log(context: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  const prefix = `[${timestamp}] [${context}]`;
  if (data) {
    console.log(prefix, message, JSON.stringify(data));
  } else {
    console.log(prefix, message);
  }
}

export function logError(context: string, message: string, error?: unknown) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  const prefix = `[${timestamp}] [${context}]`;
  const errMsg = error instanceof Error ? error.message : String(error ?? "");
  console.error(prefix, message, errMsg);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
}
