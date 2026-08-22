/**
 * Emit a searchable error event without persisting the thrown value. Error
 * messages can contain provider responses, SQL details, or user input, so only
 * the error class is safe to retain in Workers Logs.
 */
function getErrorName(error: unknown): string {
  if (error === undefined) {
    return "ReportedFailure";
  }

  return error instanceof Error ? error.name : "NonErrorThrown";
}

export function logErrorEvent(event: string, error?: unknown): void {
  console.error({
    event,
    errorName: getErrorName(error),
  });
}

export function logWarningEvent(event: string, error?: unknown): void {
  console.warn({
    event,
    errorName: getErrorName(error),
  });
}

export function logInfoEvent(event: string): void {
  console.info({ event });
}
