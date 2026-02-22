export interface Timestamp {
  readonly epochMs: number;
}

export interface Clock {
  now(): Timestamp;
  sleep(ms: number): Promise<void>;
}

export class SystemClock implements Clock {
  now(): Timestamp { return { epochMs: Date.now() }; }
  sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
}

export interface CronInput {
  cron: string;
  timezone?: string;
}

export function parseCron(input: string): CronInput {
  return { cron: input, timezone: 'UTC' };
}

export function toDate(ts: Timestamp): Date { return new Date(ts.epochMs); }

export function fromDate(date: Date): Timestamp { return { epochMs: date.getTime() }; }

export function addDays(ts: Timestamp, days: number): Timestamp { return { epochMs: ts.epochMs + days * 24 * 60 * 60 * 1000 }; }

export function addHours(ts: Timestamp, hours: number): Timestamp { return { epochMs: ts.epochMs + hours * 60 * 60 * 1000 }; }

export function fromIso(input: string): Timestamp { return { epochMs: Date.parse(input) }; }

export function toIso(ts: Timestamp): string { return new Date(ts.epochMs).toISOString(); }
