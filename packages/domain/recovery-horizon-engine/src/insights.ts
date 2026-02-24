import type {
  PluginStage,
  HorizonSignal,
  HorizonPlan,
  ValidationResult,
  ValidationIssue,
  TimeMs,
  RunId,
  PlanId,
  StageSpan,
} from './types.js';
import { horizonBrand } from './types.js';
import type { StageFold, HorizonTraceId, HorizonTenant, HorizonSessionId } from '@shared/horizon-lab-runtime';
import { normalizeTag } from '@shared/horizon-lab-runtime';
import type { JsonValue } from '@shared/type-level';

export interface HorizonTrendPoint {
  readonly tenant: HorizonTenant;
  readonly sessionId: HorizonSessionId;
  readonly stage: PluginStage;
  readonly signalCount: number;
  readonly signalRate: number;
  readonly generatedAt: TimeMs;
}

export type TraceIssue = ValidationIssue & { readonly traceId: HorizonTraceId };

export type FoldAccumulator<T> = {
  readonly [K in keyof T]: T[K];
};

export type TraceWindow<T extends readonly StageFold<any>[]> = {
  readonly window: T;
  readonly orderedStages: { [K in keyof T]?: K & number };
};

export interface RuntimeInsight<TPayload = JsonValue> {
  readonly runId: RunId;
  readonly tenant: HorizonTenant;
  readonly planId: PlanId;
  readonly trends: readonly HorizonTrendPoint[];
  readonly timeline: readonly HorizonSignal<PluginStage, TPayload>[];
  readonly summary: {
    readonly totalSignals: number;
    readonly uniqueStages: number;
    readonly criticalCount: number;
    readonly resolved: boolean;
  };
}

export type InsightPath = `insight.${HorizonTenant}.${HorizonSessionId}`;

export const toInsightPath = (tenant: HorizonTenant, sessionId: HorizonSessionId): InsightPath =>
  (`insight.${tenant}.${sessionId}` as InsightPath);

const toSeverityCount = <T extends readonly HorizonSignal<PluginStage, JsonValue>[]>(
  signals: T,
) =>
  signals.reduce(
    (acc, signal) => {
      const key = signal.severity;
      return {
        ...acc,
        [key]: (acc[key] ?? 0) + 1,
      } as typeof acc;
    },
    {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    } satisfies Record<HorizonSignal<PluginStage, JsonValue>['severity'], number>,
  );

const normalizeSeverityBuckets = (points: readonly HorizonTrendPoint[]) => {
  const low = points.filter((point) => point.signalRate < 100);
  return low.length;
};

export const buildInsight = <
  const TSignals extends readonly HorizonSignal<PluginStage, JsonValue>[]
>(
  tenant: HorizonTenant,
  sessionId: HorizonSessionId,
  runId: RunId,
  plan: HorizonPlan,
  signals: TSignals,
): RuntimeInsight<JsonValue> => {
  const latest = [...signals].sort(
    (left, right) => Number(new Date(right.startedAt)) - Number(new Date(left.startedAt)),
  );
  const severityBuckets = toSeverityCount(signals);

  const byStage = latest.reduce<Record<PluginStage, number>>((acc, signal) => {
    acc[signal.kind] = (acc[signal.kind] ?? 0) + 1;
    return acc;
  }, {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  });

  const tags = [...new Set(latest.flatMap((entry) => entry.input.tags))];
  const timeline = latest.map((entry) => ({
    ...entry,
    input: {
      ...entry.input,
      tenantId: tenant,
      tags: [...entry.input.tags, ...tags].map((tag) => normalizeTag(`${tag}`)),
    },
  }));

  const trendBuckets = Object.entries(byStage).map(([stage, count], order): HorizonTrendPoint => {
    const ratio = timeline.length ? count / timeline.length : 0;
    return {
      tenant,
      sessionId,
      stage: stage as PluginStage,
      signalCount: count,
      signalRate: ratio * 1000,
      generatedAt: horizonTimestamp(Date.now(), plan.startedAt),
    };
  });

  return {
    runId,
    tenant,
    planId: plan.id,
    trends: trendBuckets,
    timeline,
    summary: {
      totalSignals: latest.length,
      uniqueStages: Object.keys(byStage).length,
      criticalCount: severityBuckets.critical,
      resolved: plan.pluginSpan.stage === 'execute' && severityBuckets.critical < 1,
    },
  };
};

const horizonTimestamp = (value: number, fallback: TimeMs): TimeMs =>
  (Number.isFinite(value) ? value : Number(fallback)) as TimeMs;

export const validateInsights = (
  insights: readonly RuntimeInsight<JsonValue>[],
): ValidationResult<RuntimeInsight<JsonValue>[]> => {
  const issues: TraceIssue[] = [];

  for (const [index, insight] of insights.entries()) {
    if (insight.summary.totalSignals <= 0) {
      issues.push({
        path: ['insights', String(index), 'totalSignals'],
        severity: 'warn',
        message: 'empty timeline',
        traceId: `${insight.runId}` as HorizonTraceId,
      });
    }

    if (insight.summary.criticalCount > 0 && insight.summary.resolved) {
      issues.push({
        path: ['insights', String(index), 'resolved'],
        severity: 'error',
        message: 'resolved state inconsistent with critical count',
        traceId: `${insight.runId}` as HorizonTraceId,
      });
    }

    if (insight.summary.uniqueStages < 1) {
      issues.push({
        path: ['insights', String(index), 'uniqueStages'],
        severity: 'warn',
        message: 'no stages observed',
        traceId: `${insight.runId}` as HorizonTraceId,
      });
    }

    if (normalizeSeverityBuckets(insight.trends) > 0) {
      issues.push({
        path: ['insights', String(index), 'trends'],
        severity: 'warn',
        message: 'low signal load detected',
        traceId: `${insight.runId}` as HorizonTraceId,
      });
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      errors: issues,
    };
  }

  return {
    ok: true,
    value: [...insights],
  };
};

export const enrichPlanTrace = <TPlan extends HorizonPlan>(
  plan: TPlan,
  tenant: HorizonTenant,
  span: StageSpan<PluginStage> = {
    stage: 'ingest',
    label: 'INGEST_STAGE',
    startedAt: horizonBrand.fromTime(Date.now()),
    durationMs: horizonBrand.fromTime(0),
  } as StageSpan<PluginStage>,
): TPlan =>
  ({
    ...plan,
    tenantId: tenant,
    pluginSpan: {
      ...plan.pluginSpan,
      stage: span.stage,
      label: span.label,
      startedAt: span.startedAt,
    },
  }) as TPlan;

export const summarizePlan = (plan: HorizonPlan): string => {
  const stageLabel = `${plan.pluginSpan.stage}:${plan.pluginSpan.label}`;
  const window = (plan.payload as { readonly window?: readonly unknown[] } | undefined)?.window;
  return [stageLabel, `${plan.id}`, window ? JSON.stringify(window) : 'no-window'].join('::');
};

export const normalizeSummaryLines = (traces: readonly JsonValue[]) =>
  traces.map((entry) =>
    typeof entry === 'string'
      ? entry
      : typeof entry === 'number'
        ? String(entry)
        : typeof entry === 'boolean'
          ? String(entry)
          : JSON.stringify(entry),
  );
