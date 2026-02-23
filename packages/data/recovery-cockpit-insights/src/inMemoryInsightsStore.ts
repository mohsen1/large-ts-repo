import { PlanId, CockpitSignal } from '@domain/recovery-cockpit-models';
import {
  CockpitInsightsStore,
  CockpitSignalsStore,
  InsightsFilter,
  PlanInsight,
  PlanHealth,
  healthFromScores,
} from './insightModels';

export class InMemoryCockpitInsightsStore implements CockpitInsightsStore, CockpitSignalsStore {
  private readonly insights = new Map<PlanId, { value: PlanInsight; version: number; updatedAt: string }>();
  private readonly signalsByPlan = new Map<PlanId, CockpitSignal[]>();

  async upsertInsight(insight: PlanInsight): Promise<boolean> {
    const previous = this.insights.get(insight.planId);
    this.insights.set(insight.planId, {
      value: {
        ...insight,
        score: {
          ...insight.score,
          health: healthFromScores(insight.score.readiness, insight.score.risk),
        },
      },
      version: (previous?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async listInsights(filter?: InsightsFilter): Promise<readonly PlanInsight[]> {
    const all = [...this.insights.values()].map((record) => record.value);
    if (!filter) return all;

    return all.filter((insight) => {
      if (filter.minimumReadiness !== undefined && insight.score.readiness < filter.minimumReadiness) {
        return false;
      }
      if (filter.health && insight.score.health !== filter.health) {
        return false;
      }
      return true;
    });
  }

  async getInsight(planId: PlanId): Promise<PlanInsight | undefined> {
    return this.insights.get(planId)?.value;
  }

  async appendSignals(planId: PlanId, signals: readonly CockpitSignal[]): Promise<void> {
    const existing = this.signalsByPlan.get(planId) ?? [];
    this.signalsByPlan.set(planId, [...existing, ...signals]);
  }

  async latestSignals(planId: PlanId): Promise<readonly CockpitSignal[]> {
    return this.signalsByPlan.get(planId) ?? [];
  }

  countSignals(planId: PlanId): number {
    return this.signalsByPlan.get(planId)?.length ?? 0;
  }

  upsertPlanSignals(planId: PlanId, signal: CockpitSignal): void {
    const current = this.signalsByPlan.get(planId) ?? [];
    this.signalsByPlan.set(planId, [...current, signal]);
  }

  readSignalHealth(health: PlanHealth): ReadonlyArray<PlanInsight> {
    return [...this.insights.values()]
      .map((record) => record.value)
      .filter((insight) => insight.score.health === health);
  }
}

export const createInsightsStore = (): InMemoryCockpitInsightsStore => new InMemoryCockpitInsightsStore();

export type RuntimeEvent = Readonly<{
  planId: PlanId;
  actionId: string;
  status: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled' | 'idle';
  at: string;
}>;

export const toSignalDigest = (events: readonly RuntimeEvent[]): number =>
  events.filter((event) => event.status === 'failed').length;
