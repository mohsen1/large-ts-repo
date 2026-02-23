import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { RecoveryPlan, PlanId, UtcIsoTimestamp, CockpitSignal } from '@domain/recovery-cockpit-models';
import { buildHealthMatrix, buildPlanForecast } from '@domain/recovery-cockpit-intelligence';
import { buildPolicySignature } from '@domain/recovery-cockpit-workloads';
import { buildSloLedger, SloLedgerLine } from '@data/recovery-cockpit-store';
import { buildTrendline } from './trendline';

type SignalReader = {
  latestSignals(planId: PlanId): Promise<readonly unknown[]>;
};

export type CoverageDimensions = {
  readonly health: number;
  readonly forecastCoverage: number;
  readonly policyCoverage: number;
  readonly slaCoverage: number;
  readonly signals: number;
  readonly trend: ReturnType<typeof buildTrendline>;
};

export type OrchestratedCoverage = {
  readonly planId: PlanId;
  readonly planLabel: string;
  readonly dimensions: CoverageDimensions;
  readonly rationale: readonly string[];
};

const toRatio = (value: number, total: number): number => (total <= 0 ? 0 : value / total);

const coverageByHealth = (plan: RecoveryPlan, signals: readonly CockpitSignal[]): number => {
  const matrix = buildHealthMatrix(plan, signals, {
    policyMode: 'advisory',
    includeSignals: true,
    signalCap: 25,
  });
  return Number((matrix.score / 100).toFixed(4));
};

const coverageByForecast = (plan: RecoveryPlan): number => {
  const forecast = buildPlanForecast(plan, plan.mode === 'automated' ? 'aggressive' : 'balanced');
  return forecast.summary / 100;
};

const coverageByPolicy = (plan: RecoveryPlan): number => {
  const policy = buildPolicySignature(plan);
  const passing = policy.factors.filter((entry) => entry.score >= 60).length;
  return Number((passing / policy.factors.length).toFixed(4));
};

const reasonLine = (label: string, value: number): string => `${label}:${value.toFixed(2)}`;

export const buildCoverageDimensions = async (
  plan: RecoveryPlan,
  planStore: InMemoryCockpitStore,
  slaLine: SloLedgerLine | undefined,
): Promise<CoverageDimensions> => {
  const events = await planStore.getEvents(plan.planId, 500);
  const runs = await planStore.listRuns(plan.planId);
  const failedEvents = events.filter((event) => event.status === 'failed' || event.status === 'cancelled');
  const health = coverageByHealth(plan, []);
  const forecastCoverage = coverageByForecast(plan);
  const policyCoverage = coverageByPolicy(plan);
  const slaCoverage = slaLine ? slaLine.slaCoverage.ratio : 0;
  const policySignature = buildPolicySignature(plan);
  const signalDensity = {
    critical: 0,
    warning: failedEvents.length,
    notice: Math.max(0, events.length - failedEvents.length),
    info: 0,
  };

  const trend = buildTrendline([
    {
      planId: plan.planId,
      at: new Date().toISOString() as UtcIsoTimestamp,
      risk: 100 - health * 100,
      readinessScore: 100 - health * 10,
      policy: policySignature,
      signalDensity,
      eventsCount: events.length,
    },
  ]);

  const signalCount = failedEvents.length + (runs.ok ? runs.value.length : 0);

  return {
    health,
    forecastCoverage,
    policyCoverage,
    slaCoverage,
    signals: signalCount,
    trend,
  };
};

export const buildCoverageByPlan = async (
  plan: RecoveryPlan,
  planStore: InMemoryCockpitStore,
  signalStore: SignalReader | undefined,
): Promise<OrchestratedCoverage> => {
  const ledger = await buildSloLedger(planStore);
  const ledgerForPlan = ledger.find((entry) => entry.planId === plan.planId);
  const dimensions = await buildCoverageDimensions(plan, planStore, ledgerForPlan);

  const signalEnvelope = signalStore ? await signalStore.latestSignals(plan.planId) : [];
  const rationale: string[] = [
    reasonLine('health', dimensions.health),
    reasonLine('forecast', dimensions.forecastCoverage),
    reasonLine('policy', dimensions.policyCoverage),
    reasonLine('sla', dimensions.slaCoverage),
    `signals=${signalEnvelope.length + dimensions.signals}`,
  ];

  return {
    planId: plan.planId,
    planLabel: plan.labels.short,
    dimensions,
    rationale,
  };
};

export const rankCoverage = async (
  plans: readonly RecoveryPlan[],
  store: InMemoryCockpitStore,
  insights: SignalReader | undefined,
): Promise<readonly OrchestratedCoverage[]> => {
  const list: OrchestratedCoverage[] = [];
  for (const plan of plans) {
    list.push(await buildCoverageByPlan(plan, store, insights));
  }
  return list.sort((left, right) => {
    const leftScore = scoreCoverage(left.dimensions);
    const rightScore = scoreCoverage(right.dimensions);
    return rightScore - leftScore;
  });
};

export const scoreCoverage = (coverage: CoverageDimensions): number => {
  const aggregate = toRatio(
    [coverage.health, coverage.forecastCoverage, coverage.policyCoverage, coverage.slaCoverage]
      .map((value) => value * 100)
      .reduce((acc, value) => acc + value, 0),
    400,
  );
  const penalty = Math.min(1, coverage.signals / 200);
  return Number(Math.max(0, Math.min(1, aggregate - penalty * 0.15)).toFixed(4));
};
