import { Brand } from '@shared/type-level';
import { RecoveryPlan, ReadinessWindow, UtcIsoTimestamp } from '@domain/recovery-cockpit-models';
import { PlanForecast } from './forecast';
import { buildDependencyGraph } from './dependencyGraph';
import { scoreFromSignals } from './signals';

export type CockpitBundleId = Brand<string, 'CockpitBundleId'>;

export type BundleSource = Readonly<{
  readonly kind: 'store' | 'runtime' | 'manual';
  readonly at: Date;
}>;

export type CockpitBundle = {
  readonly bundleId: CockpitBundleId;
  readonly plan: RecoveryPlan;
  readonly windows: ReadonlyArray<ReadinessWindow>;
  readonly source: BundleSource;
  readonly signalScore: number;
};

export const createBundleId = (planId: string): CockpitBundleId =>
  `${planId}:${Date.now()}` as CockpitBundleId;

export const readTimestamp = (value: Date): UtcIsoTimestamp => value.toISOString() as UtcIsoTimestamp;

export const bundleSignalScore = (bundle: CockpitBundle): number => {
  return Math.max(0, Math.min(100, scoreFromSignals(bundle.source.kind === 'manual' ? [] : [])));
};

export const bundleToForecast = (bundle: CockpitBundle): PlanForecast => ({
  mode: 'balanced',
  planId: bundle.plan.planId,
  summary: bundle.windows.reduce((acc, window) => acc + window.expectedRecoveryMinutes + window.score, 0),
  windows: bundle.windows.map((window) => ({
    at: window.at,
    value: Math.max(0, window.score),
    delta: 0,
    factors: ['forecast', bundle.source.kind, bundle.plan.labels.short],
  })),
});

export const dependencyRisk = (plan: RecoveryPlan): number => {
  const graph = buildDependencyGraph(plan.actions);
  let total = 0;
  for (const node of graph.nodes.values()) {
    total += node.riskScore;
  }
  return Math.min(100, total / Math.max(1, graph.nodes.size));
};

export const buildBundle = (plan: RecoveryPlan, windows: ReadonlyArray<ReadinessWindow>): CockpitBundle => ({
  bundleId: createBundleId(plan.planId),
  plan,
  windows,
  source: {
    kind: 'runtime',
    at: new Date(),
  },
  signalScore: windows.reduce((acc, window) => acc + window.expectedRecoveryMinutes + window.score, 0),
});
