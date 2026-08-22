export const INCIDENT_TITLE: string;
export function parseWorkerErrors(payload: unknown): number;
export function smokeWithRetries(options: {
  appOrigin: string;
  wwwOrigin: string;
  attempts: number;
  delayMs: number;
  timeoutMs: number;
}): Promise<{
  healthy: boolean;
  attempts: number;
  errorName?: string;
}>;
export function main(): Promise<void>;
