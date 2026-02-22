import type { RunSessionRecord, SessionQueryFilter } from './models';
import type {
  RunSession,
  RunPlanSnapshot,
  SessionDecision,
} from '@domain/recovery-operations-models';

export type TelemetrySignal = 'run' | 'plan' | 'decision' | 'route';

export interface TelemetryEntry {
  readonly id: string;
  readonly tenant: string;
  readonly type: TelemetrySignal;
  readonly value: unknown;
  readonly at: string;
}

export interface TimeSeriesBin {
  readonly bucket: number;
  readonly value: number;
}

export interface StoreTelemetryIndex {
  readonly tenant: string;
  readonly byType: Record<TelemetrySignal, readonly TelemetryEntry[]>;
  readonly byMinute: readonly TimeSeriesBin[];
  readonly querySummary: {
    readonly signalCount: number;
    readonly sessionCount: number;
    readonly planCount: number;
    readonly decisionCount: number;
  };
}

const toMinute = (iso: string): number => {
  const date = new Date(iso);
  const rounded = new Date(date.toISOString().slice(0, 16));
  return rounded.getTime();
};

export const buildTelemetryEntry = (tenant: string, type: TelemetrySignal, value: unknown): TelemetryEntry => {
  return {
    id: `${tenant}:${type}:${Date.now()}`,
    tenant,
    type,
    value,
    at: new Date().toISOString(),
  };
};

export const hydrateTelemetryIndex = (tenant: string, entries: readonly TelemetryEntry[]): StoreTelemetryIndex => {
  const byType: Record<TelemetrySignal, TelemetryEntry[]> = {
    run: [],
    plan: [],
    decision: [],
    route: [],
  };

  for (const entry of entries) {
    byType[entry.type] = [...byType[entry.type], entry];
  }

  const grouped = new Map<number, number>();
  for (const entry of entries) {
    const bucket = toMinute(entry.at);
    grouped.set(bucket, (grouped.get(bucket) ?? 0) + 1);
  }

  const byMinute = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bucket, value]) => ({ bucket, value }));

  const querySummary = {
    signalCount: entries.length,
    sessionCount: byType.run.length,
    planCount: byType.plan.length,
    decisionCount: byType.decision.length,
  };

  return {
    tenant,
    byType,
    byMinute,
    querySummary,
  };
};

export const summarizeByFilter = (
  sessions: readonly RunSession[],
  plans: readonly RunPlanSnapshot[],
  decisions: readonly SessionDecision[],
  filter: SessionQueryFilter,
): StoreTelemetryIndex => {
  const tenant = filter.tenant ?? 'global';

  const entries: TelemetryEntry[] = [];

  for (const session of sessions) {
    if (filter.runId && session.runId !== filter.runId) continue;
    if (filter.ticketId && session.ticketId !== filter.ticketId) continue;
    if (filter.status) {
      if (Array.isArray(filter.status) && !filter.status.includes(session.status)) continue;
      if (!Array.isArray(filter.status) && session.status !== filter.status) continue;
    }
    entries.push(buildTelemetryEntry(tenant, 'run', {
      id: String(session.id),
      runId: session.runId,
      status: session.status,
    }));
  }

  for (const plan of plans) {
    entries.push(buildTelemetryEntry(tenant, 'plan', {
      id: String(plan.id),
      runId: plan.id,
      fingerprint: plan.fingerprint,
      score: plan.constraints.maxRetries + plan.constraints.maxParallelism,
    }));
  }

  for (const decision of decisions) {
    entries.push(buildTelemetryEntry(tenant, 'decision', {
      runId: decision.runId,
      accepted: decision.accepted,
      score: decision.score,
      reasonCodes: decision.reasonCodes,
    }));
  }

  return hydrateTelemetryIndex(tenant, entries);
};

export const flattenEntries = (index: StoreTelemetryIndex): readonly TelemetryEntry[] =>
  (Object.values(index.byType).flat() as TelemetryEntry[])
    .sort((left, right) => left.at.localeCompare(right.at));

export const selectDensity = (index: StoreTelemetryIndex, stepMinutes: number): readonly TimeSeriesBin[] => {
  const limit = Math.max(1, stepMinutes);
  const selected: TimeSeriesBin[] = [];
  const buckets = index.byMinute;

  for (let start = 0; start < buckets.length; start += limit) {
    const chunk = buckets.slice(start, start + limit);
    if (chunk.length === 0) continue;
    const sum = chunk.reduce((acc, entry) => acc + entry.value, 0);
    const bucket = chunk[0]!.bucket;
    selected.push({ bucket, value: sum });
  }

  return selected;
};

export const toSignalLines = (index: StoreTelemetryIndex): string[] => {
  return flattenEntries(index).map((entry) => {
    return `${entry.at} ${entry.tenant} ${entry.type} ${JSON.stringify(entry.value)}`;
  });
};

export const replaySession = (records: readonly RunSessionRecord[]): RunSession[] => {
  return records.map((record) => ({
    id: record.id,
    runId: record.runId,
    ticketId: record.ticketId,
    planId: record.planId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    constraints: record.constraints,
    signals: [...record.signals],
  }));
};
