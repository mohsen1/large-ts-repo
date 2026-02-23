import { PlanId, RecoveryPlan, RuntimeRun, SignalDigest, CockpitSignal } from '@domain/recovery-cockpit-models';

export type PlanHealth = 'green' | 'yellow' | 'red';

export type InsightScore = {
  readonly planId: PlanId;
  readonly risk: number;
  readonly readiness: number;
  readonly policy: number;
  readonly health: PlanHealth;
  readonly reasons: readonly string[];
};

export type PlanInsight = {
  readonly planId: PlanId;
  readonly summary: string;
  readonly createdAt: string;
  readonly runCount: number;
  readonly latestRunState?: RuntimeRun['state'];
  readonly forecastSummary: number;
  readonly score: InsightScore;
};

export type InsightsFilter = {
  readonly minimumReadiness?: number;
  readonly health?: PlanHealth;
  readonly hasSignals?: boolean;
};

export type CockpitInsight = {
  readonly plan: RecoveryPlan;
  readonly insight: PlanInsight;
  readonly forecast: number;
  readonly signals: readonly CockpitSignal[];
};

export type StoreError = 'store-unavailable' | 'plan-not-found' | 'projection-error';

export interface CockpitInsightsStore {
  upsertInsight(insight: PlanInsight): Promise<boolean>;
  listInsights(filter?: InsightsFilter): Promise<readonly PlanInsight[]>;
  getInsight(planId: PlanId): Promise<PlanInsight | undefined>;
}

export interface CockpitSignalsStore {
  appendSignals(planId: PlanId, signals: readonly CockpitSignal[]): Promise<void>;
  latestSignals(planId: PlanId): Promise<readonly CockpitSignal[]>;
}

export const healthFromScores = (readiness: number, risk: number): PlanHealth => {
  if (readiness >= 85 && risk <= 20) return 'green';
  if (readiness >= 60 && risk <= 50) return 'yellow';
  return 'red';
};

export const summarizeSignalDigest = (digest: SignalDigest): string =>
  `active=${digest.activeCount},critical=${digest.criticalCount},muted=${digest.mutedCount}`;
