export const DEFAULT_DLQ_NAME: string;
export const INCIDENT_TITLE: string;

export interface DlqMetrics {
  backlogBytes: number;
  backlogCount: number;
  oldestMessageTimestampMs: number;
}

export type IncidentAction = "open" | "keep-open" | "resolve" | "none";

export function parseQueueListPayload(payload: unknown, queueName: string): string;
export function parseQueueMetricsPayload(payload: unknown): DlqMetrics;
export function decideIncidentAction(input: {
  backlogCount: number;
  openIncidentCount: number;
}): IncidentAction;
export function main(): Promise<void>;
