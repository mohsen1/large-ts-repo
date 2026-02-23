import { withBrand } from '@shared/core';
import { type Brand, DeepMerge } from '@shared/type-level';

import type { RecoveryPlaybookContext, PlaybookExecutionReport, RecoveryPlaybook } from './models';

export type TelemetryBucket = Brand<string, 'TelemetryBucket'>;

export interface PlaybookTimelinePoint {
  readonly bucket: TelemetryBucket;
  readonly at: string;
  readonly playbookId: string;
  readonly selected: number;
  readonly completed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly avgLatencyMinutes: number;
}

export interface PlaybookTelemetryAggregate {
  readonly portfolioId: string;
  readonly tenant: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly points: readonly PlaybookTimelinePoint[];
  readonly summary: {
    readonly runCount: number;
    readonly completionRate: number;
    readonly failRate: number;
    readonly avgLatencyMinutes: number;
  };
}

export interface PlaybookTelemetryEnvelope<TPayload = unknown> {
  readonly id: Brand<string, 'PlaybookTelemetryId'>;
  readonly portfolioId: Brand<string, 'PlaybookPortfolioId'>;
  readonly tenant: string;
  readonly at: string;
  readonly kind: 'run-started' | 'run-completed' | 'run-failed' | 'run-aborted';
  readonly payload: TPayload;
}

export interface PlaybookTelemetryRecorder {
  append<TPayload extends TenantPlaybookSignal>(envelope: PlaybookTelemetryEnvelope<TPayload>): void;
  snapshot(): PlaybookTelemetryAggregate[];
  toReport(playbookId: string): PlaybookExecutionReport | undefined;
}

export interface TelemetryWindowInput {
  readonly portfolioId: string;
  readonly tenant: string;
  readonly durationMinutes: number;
  readonly now?: string;
}

export interface TenantPlaybookSignal {
  readonly tenant: string;
  readonly playbookId: string;
  readonly severity: number;
  readonly latencyMinutes: number;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  readonly context: RecoveryPlaybookContext;
  readonly metadata: Record<string, string | number | boolean>;
}

const bucketFor = (iso: string): TelemetryBucket => {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return withBrand(`bucket:${Date.now()}`, 'TelemetryBucket');
  }
  return withBrand(`bucket:${new Date(parsed).toISOString().slice(0, 13)}`, 'TelemetryBucket');
};

const nowIso = (): string => new Date().toISOString();

const defaultWindowBound = (minutes = 15): string => new Date(Date.now() - minutes * 60 * 1000).toISOString();

const normalizeInput = (input: Readonly<PlaybookTimelinePoint>): PlaybookTimelinePoint => ({
  bucket: input.bucket,
  at: input.at,
  playbookId: input.playbookId,
  selected: Math.max(0, Math.trunc(input.selected)),
  completed: Math.max(0, Math.trunc(input.completed)),
  skipped: Math.max(0, Math.trunc(input.skipped)),
  failed: Math.max(0, Math.trunc(input.failed)),
  avgLatencyMinutes: Math.max(0, input.avgLatencyMinutes),
});

export const mergePoint = (
  a: PlaybookTimelinePoint,
  b: PlaybookTimelinePoint,
): PlaybookTimelinePoint => {
  if (a.playbookId !== b.playbookId || a.bucket !== b.bucket) {
    return a;
  }
  const selected = a.selected + b.selected;
  const completed = a.completed + b.completed;
  const skipped = a.skipped + b.skipped;
  const failed = a.failed + b.failed;
  const points = a.completed + b.completed + a.skipped + b.skipped + a.failed + b.failed;
  const latency = points > 0
    ? ((a.avgLatencyMinutes * Math.max(1, selected)) + (b.avgLatencyMinutes * Math.max(1, selected)) / 2)
    / Math.max(1, selected)
    : 0;
  return normalizeInput({
    bucket: a.bucket,
    at: a.at,
    playbookId: a.playbookId,
    selected,
    completed,
    skipped,
    failed,
    avgLatencyMinutes: latency,
  });
};

export class InMemoryPlaybookTelemetryRecorder implements PlaybookTelemetryRecorder {
  private readonly envelopes: PlaybookTelemetryEnvelope<TenantPlaybookSignal>[] = [];
  private readonly pointsByBucket = new Map<string, PlaybookTimelinePoint>();

  append<TPayload extends TenantPlaybookSignal>(envelope: PlaybookTelemetryEnvelope<TPayload>): void {
    const payload = envelope.payload;
    const point: PlaybookTimelinePoint = normalizeInput({
      bucket: bucketFor(envelope.at),
      at: envelope.at,
      playbookId: payload.playbookId,
      selected: 1,
      completed: payload.status === 'completed' ? 1 : 0,
      skipped: payload.status === 'aborted' ? 1 : 0,
      failed: payload.status === 'failed' ? 1 : 0,
      avgLatencyMinutes: payload.latencyMinutes,
    });
    this.envelopes.push({
      id: withBrand(`${envelope.id}-${Date.now()}`, 'PlaybookTelemetryId'),
      portfolioId: envelope.portfolioId,
      tenant: envelope.tenant,
      at: envelope.at,
      kind: envelope.kind,
      payload,
    });
    const key = `${envelope.tenant}:${point.bucket}:${payload.playbookId}`;
    const existing = this.pointsByBucket.get(key);
    this.pointsByBucket.set(key, existing ? mergePoint(existing, point) : point);
  }

  snapshot(): PlaybookTelemetryAggregate[] {
    const points = [...this.pointsByBucket.values()];
    const grouped = points.reduce<Record<string, PlaybookTimelinePoint[]>>((acc, point) => {
      const key = `${point.playbookId}`;
      acc[key] ??= [];
      acc[key].push(point);
      return acc;
    }, {});

    return Object.entries(grouped).map(([portfolioId, entries]) => {
      const windowStart = entries.length > 0 ? entries[entries.length - 1]!.at : nowIso();
      const payloads = this.envelopes.filter((entry) => entry.id.includes(portfolioId));
      const tenant = payloads[0]?.tenant ?? 'tenant:unknown';
      const runCount = entries.reduce((acc, point) => acc + point.selected, 0);
      const completed = entries.reduce((acc, point) => acc + point.completed, 0);
      const failed = entries.reduce((acc, point) => acc + point.failed, 0);
      const avgLatency = entries.reduce((acc, point) => acc + point.avgLatencyMinutes, 0) / Math.max(1, entries.length);
      return {
        portfolioId,
        tenant,
        windowStart,
        windowEnd: nowIso(),
        points: entries,
        summary: {
          runCount,
          completionRate: completed / Math.max(1, runCount),
          failRate: failed / Math.max(1, runCount),
          avgLatencyMinutes: avgLatency,
        },
      };
    });
  }

  toReport(playbookId: string): PlaybookExecutionReport | undefined {
    const points = [...this.pointsByBucket.values()].filter((point) => point.playbookId === playbookId);
    if (points.length === 0) return undefined;
    const totalRuns = points.reduce((acc, point) => acc + point.selected, 0);
    const failures = points.reduce((acc, point) => acc + point.failed, 0);
    const elapsedMinutes = points.reduce((acc, point) => acc + point.avgLatencyMinutes, 0);
    const status = failures > 0 ? 'failed' : 'completed';
    return {
      run: {
        id: withBrand(`report:${playbookId}`, 'RecoveryPlanId'),
        runId: withBrand(`run:${playbookId}`, 'RecoveryRunId'),
        playbookId: withBrand(playbookId, 'RecoveryPlaybookId'),
        status,
        selectedStepIds: [],
        startedAt: points[0]?.at,
        completedAt: points.at(-1)?.at,
        operator: 'telemetry',
        telemetry: {
          attempts: totalRuns,
          failures,
          recoveredStepIds: [],
        },
      },
      warnings: [],
      errors: [],
      elapsedMinutes,
    };
  }
}

export const telemetryEnvelope = <TPayload>(
  input: Omit<PlaybookTelemetryEnvelope<TPayload>, 'id' | 'at' | 'kind'> & {
    readonly kind: PlaybookTelemetryEnvelope['kind'];
  },
): PlaybookTelemetryEnvelope<TPayload> => ({
  ...input,
  id: withBrand(`${input.portfolioId}:${input.payload ? 1 : 0}:${nowIso()}`, 'PlaybookTelemetryId'),
  at: nowIso(),
  kind: input.kind,
});

export const buildWindow = (
  input: TelemetryWindowInput,
): { readonly start: string; readonly end: string } => ({
  start: defaultWindowBound(input.durationMinutes),
  end: input.now ?? nowIso(),
});

export const buildSignalsFromReport = (
  context: RecoveryPlaybookContext,
  report: PlaybookExecutionReport,
): TenantPlaybookSignal[] => {
  const completeSeverity = context.affectedRegions.length / 10;
  const latency = report.elapsedMinutes / Math.max(1, report.run.selectedStepIds.length);
  return [
    {
      tenant: context.tenantId,
      playbookId: String(report.run.playbookId),
      severity: completeSeverity,
      latencyMinutes: Number.isFinite(latency) ? latency : 0,
      status: 'completed',
      context,
      metadata: {
        operator: report.run.operator,
        runId: report.run.runId,
      },
    },
  ];
};

export const buildTimelineFromSnapshot = (
  snapshot: PlaybookTelemetryAggregate,
): readonly DeepMerge<PlaybookTimelinePoint, { readonly title: string }>[] =>
  snapshot.points.map((point) => ({
    ...point,
    title: `${point.playbookId}:${point.bucket}`,
  }));
