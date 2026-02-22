import { withBrand } from '@shared/core';
import type {
  DrillMode,
  DrillRunContext,
  DrillTemplate,
  RecoveryDrillTenantId,
  RecoveryDrillRunId,
} from './types';

export interface ExecutionSignal {
  readonly tenantId: RecoveryDrillTenantId;
  readonly component: string;
  readonly status: 'ok' | 'degraded' | 'lost';
  readonly at: string;
  readonly weight: number;
}

export interface ExecutionIntent {
  readonly template: DrillTemplate;
  readonly mode: DrillMode;
  readonly signals: readonly ExecutionSignal[];
  readonly initiatedBy: string;
  readonly requestedAt: string;
}

export interface ExecutionWindow {
  readonly tenantId: RecoveryDrillTenantId;
  readonly startAt: string;
  readonly endAt: string;
  readonly status: 'open' | 'locked' | 'finished';
}

export interface ReadinessHint {
  readonly stepId: string;
  readonly ready: boolean;
  readonly reasons: readonly string[];
  readonly confidence: number;
}

export interface ExecutionReadiness {
  readonly tenantId: RecoveryDrillTenantId;
  readonly mode: DrillMode;
  readonly overallReady: boolean;
  readonly hints: readonly ReadinessHint[];
  readonly windowOpen: boolean;
  readonly calculatedAt: string;
}

const signalWeight = (signal: ExecutionSignal): number => {
  if (signal.status === 'ok') return Math.max(0, signal.weight);
  if (signal.status === 'degraded') return Math.max(0, signal.weight * 0.45);
  return Math.min(0, -Math.abs(signal.weight));
};

const summarizeSignal = (signals: readonly ExecutionSignal[]): {
  readonly score: number;
  readonly warnings: readonly string[];
} => {
  let score = 0;
  const warnings: string[] = [];
  for (const signal of signals) {
    score += signalWeight(signal);
    if (signal.status === 'degraded') warnings.push(`${signal.component}: degraded`);
    if (signal.status === 'lost') warnings.push(`${signal.component}: lost`);
  }
  return { score: Number(score.toFixed(2)), warnings };
};

const normalizeSignals = (signals: readonly ExecutionSignal[]): readonly ExecutionSignal[] =>
  signals
    .map((signal) => ({
      ...signal,
      at: signal.at || new Date().toISOString(),
      weight: Number.isFinite(signal.weight) ? signal.weight : 0,
      status: signal.status || 'ok',
      component: signal.component || 'unknown',
    }))
    .slice(0, Math.max(0, signals.length));

export const buildExecutionIntent = (
  template: DrillTemplate,
  mode: DrillMode,
  tenantId: RecoveryDrillTenantId,
  initiatedBy: string,
  signals: readonly ExecutionSignal[],
): ExecutionIntent => ({
  template,
  mode,
  signals: normalizeSignals(signals),
  initiatedBy,
  requestedAt: new Date().toISOString(),
});

export const deriveExecutionContext = (intent: ExecutionIntent): DrillRunContext => ({
  runId: withBrand(`${intent.template.id}-${Date.now()}`, 'RecoveryDrillRunId') as RecoveryDrillRunId,
  templateId: intent.template.id,
  runAt: new Date().toISOString(),
  initiatedBy: withBrand(intent.initiatedBy, 'IdentityId') as DrillTemplate['createdBy'],
  mode: intent.mode,
  approvals: Math.max(1, intent.template.defaultApprovals),
});

export const evaluateExecutionReadiness = (intent: ExecutionIntent, now = new Date().toISOString()): ExecutionReadiness => {
  const normalizedSignals = normalizeSignals(intent.signals);
  const windowOpen = normalizedSignals.length === 0 || normalizedSignals.some((signal) => signal.status !== 'lost');
  const summary = summarizeSignal(normalizedSignals);
  const hints: ReadinessHint[] = normalizedSignals.map((signal) => ({
    stepId: `${signal.component}-ready`,
    ready: signal.status !== 'lost',
    reasons: [
      signal.status === 'ok' ? 'component steady' : 'component below threshold',
      ...[signal.status === 'degraded' ? 'requires mitigation' : []],
    ]
      .flat()
      .filter((reason): reason is string => Boolean(reason)),
    confidence: Math.max(0, Math.min(1, Number((signalWeight(signal) / 10).toFixed(2)))),
  }));
  const overallReady = summary.score > 0 && windowOpen && hints.every((hint) => hint.ready);

  return {
    tenantId: intent.template.tenantId,
    mode: intent.mode,
    overallReady,
    hints,
    windowOpen,
    calculatedAt: now,
  };
};

export const mergeExecutionWindows = (
  tenantId: RecoveryDrillTenantId,
  existing: readonly ExecutionWindow[],
): readonly ExecutionWindow[] => {
  const now = Date.now();
  const withStatus = existing.map((window) => {
    const end = Date.parse(window.endAt);
    const start = Date.parse(window.startAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return { ...window, status: 'locked' as const };
    }
    if (now < start) return { ...window, status: 'locked' as const };
    if (now <= end) return { ...window, status: 'open' as const };
    return { ...window, status: 'finished' as const };
  });

  const active = withStatus.filter((window) => window.tenantId === tenantId);
  return active.sort((left, right) => Date.parse(right.startAt) - Date.parse(left.startAt));
};
