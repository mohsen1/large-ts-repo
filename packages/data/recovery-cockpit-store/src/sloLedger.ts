import { InMemoryCockpitStore } from './memoryRepository';
import { PlanId, RuntimeRun, RecoveryPlan } from '@domain/recovery-cockpit-models';
import { summarizePlanHealth } from './planHealth';
import { toPercent, normalizeNumber } from '@shared/util';

export type SloEnvelope = {
  readonly planId: PlanId;
  readonly target: number;
  readonly achieved: number;
  readonly ratio: number;
  readonly status: 'ok' | 'warning' | 'breach';
};

export type SloLedgerLine = {
  readonly planId: PlanId;
  readonly planLabel: string;
  readonly slaMinutes: number;
  readonly latestRun?: RuntimeRun;
  readonly readiness: number;
  readonly activeSignals: number;
  readonly slaCoverage: SloEnvelope;
  readonly actionsExpected: number;
  readonly lastUpdated: string;
};

const classify = (ratio: number): SloEnvelope['status'] => {
  if (ratio >= 0.98) return 'ok';
  if (ratio >= 0.8) return 'warning';
  return 'breach';
};

export const evaluatePlanSlo = async (
  store: InMemoryCockpitStore,
  planId: PlanId,
): Promise<SloLedgerLine | undefined> => {
  const planResult = await store.getPlan(planId);
  if (!planResult.ok || !planResult.value) {
    return undefined;
  }
  const plan: RecoveryPlan = planResult.value;

  const runsResult = await store.listRuns(plan.planId);
  if (!runsResult.ok) {
    return undefined;
  }
  const runs = runsResult.value;
  const latestRun = runs.at(-1);
  const readinessResult = await summarizePlanHealth(store, plan.planId);
  const readiness = readinessResult.ok ? readinessResult.value.latestReadiness : 100;

  const completed = runs.filter((run) => run.state === 'completed').length;
  const target = Math.max(1, plan.slaMinutes);
  const ratio = toPercent(completed, runs.length || 1) / 100;
  const signalHealth = runs.length > 0 ? Math.min(1, runs[0]?.activeActionIds.length ? 0.9 : 1) : 1;

  const achieved = Number((ratio * signalHealth).toFixed(4));
  const normalized = normalizeNumber((target * achieved) / 100);
  return {
    planId: plan.planId,
    planLabel: plan.labels.short,
    slaMinutes: plan.slaMinutes,
    latestRun,
    readiness,
    activeSignals: runs.flatMap((run) => run.activeActionIds).length,
    slaCoverage: {
      planId: plan.planId,
      target,
      achieved: normalized,
      ratio: achieveScore(ratio, signalHealth),
      status: classify(ratio * signalHealth),
    },
    actionsExpected: plan.actions.length,
    lastUpdated: new Date().toISOString(),
  };
};

const achieveScore = (ratio: number, signal: number): number => normalizeNumber(ratio * signal * 100);

export const buildSloLedger = async (store: InMemoryCockpitStore): Promise<readonly SloLedgerLine[]> => {
  const plans = await store.listPlans();
  if (!plans.ok) {
    return [];
  }

  const lines: SloLedgerLine[] = [];
  for (const plan of plans.value) {
    const line = await evaluatePlanSlo(store, plan.planId);
    if (line) {
      lines.push(line);
    }
  }

  return lines.sort((left, right) => right.slaCoverage.ratio - left.slaCoverage.ratio);
};
