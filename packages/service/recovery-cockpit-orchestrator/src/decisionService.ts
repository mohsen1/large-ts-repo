import { RecoveryPlan, RuntimeRun, CommandEvent } from '@domain/recovery-cockpit-models';
import { buildHealthMatrix, summarizeMatrix } from '@domain/recovery-cockpit-intelligence';
import { buildIncidentMatrix, IncidentMatrixCell } from '@domain/recovery-cockpit-workloads';
import { buildSlISchedule } from '@domain/recovery-cockpit-workloads';
import { InMemoryCockpitInsightsStore } from '@data/recovery-cockpit-insights';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { evaluatePlanSla } from '@domain/recovery-cockpit-models';

export type DecisionMode = 'safe' | 'balanced' | 'aggressive';

export type DecisionInput = {
  plan: RecoveryPlan;
  signalsCount: number;
  recentRun: RuntimeRun | undefined;
  events: readonly CommandEvent[];
};

export type DecisionSignal = {
  readonly action: 'pause' | 'continue' | 'abort' | 'escalate';
  readonly rationale: readonly string[];
  readonly score: number;
};

export type DecisionResult = {
  readonly planId: string;
  readonly mode: DecisionMode;
  readonly matrix: ReturnType<typeof buildHealthMatrix>;
  readonly incidents: readonly IncidentMatrixCell[];
  readonly sliRisk: number;
  readonly signals: readonly DecisionSignal[];
};

const eventFailureRate = (events: readonly CommandEvent[]): number => {
  if (events.length === 0) return 0;
  const failed = events.filter((event) => event.status === 'failed' || event.status === 'cancelled').length;
  return Number(((failed / events.length) * 100).toFixed(2));
};

const planRiskSignals = (plan: RecoveryPlan, events: readonly CommandEvent[]): readonly DecisionSignal[] => {
  const signals: DecisionSignal[] = [];
  const failureRate = eventFailureRate(events);
  const sla = evaluatePlanSla(plan);
  if (failureRate > 20) {
    signals.push({
      action: 'pause',
      rationale: [`failureRate=${failureRate}`],
      score: Number((100 - failureRate).toFixed(2)),
    });
  }
  if (sla.overallScore < 55) {
    signals.push({
      action: 'escalate',
      rationale: [`sla=${sla.overallScore}`],
      score: sla.overallScore,
    });
  }
  return signals;
};

const decideMode = (signals: readonly DecisionSignal[], events: readonly CommandEvent[]): DecisionMode => {
  const hasEscalate = signals.some((signal) => signal.action === 'escalate');
  const hasAbort = events.some((event) => event.status === 'cancelled');
  if (hasEscalate || hasAbort) {
    return 'safe';
  }
  if (signals.some((signal) => signal.action === 'pause')) {
    return 'balanced';
  }
  return 'aggressive';
};

export const assessPlan = async (
  input: DecisionInput,
  store: InMemoryCockpitStore,
  insightsStore: InMemoryCockpitInsightsStore,
): Promise<DecisionResult> => {
  const matrix = buildHealthMatrix(input.plan, [], {
    policyMode: 'advisory',
    includeSignals: true,
    signalCap: 50,
  });

  const incidents = buildIncidentMatrix(input.plan);
  const incidentTop = incidents.cells.slice(0, 5);

  const sliSchedule = buildSlISchedule(input.plan);
  const sliRisk = sliSchedule.summary.maxPredicted;

  const signals = planRiskSignals(input.plan, input.events);
  const planSignals = await insightsStore.latestSignals(input.plan.planId);
  const mergedSignals = [
    ...signals,
    ...planSignals.map((signal) => ({
      action: 'pause' as const,
      rationale: ['stored-signal'],
      score: 'severity' in signal && signal.severity === 'critical' ? 80 : 40,
    })),
  ];

  const mode = decideMode(mergedSignals, input.events);
  const recentRunLine = input.recentRun ? `run=${input.recentRun.state}` : 'run:none';

  return {
    planId: input.plan.planId,
    mode,
    matrix,
    incidents: incidentTop,
    sliRisk,
    signals: [
      ...mergedSignals,
      {
        action: mergedSignals.length === 0 ? 'continue' : 'pause',
        rationale: [summarizeMatrix(matrix), recentRunLine],
        score: matrix.score,
      },
    ],
  };
};
