import { Result, fail, ok } from '@shared/result';
import { RecoveryPlan, RuntimeRun, CommandEvent, PlanId, ReadinessEnvelope } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore } from './memoryRepository';
import { groupBy, normalizeNumber, movingAverage, percentile } from '@shared/util';

export type PlanReadinessRecord = {
  readonly planId: PlanId;
  readonly readiness: number;
  readonly planActionCount: number;
  readonly signalCount: number;
  readonly at: string;
};

export type PlanHealthSummary = {
  readonly planId: PlanId;
  readonly latestReadiness: number;
  readonly trend: 'improving' | 'stable' | 'degrading';
  readonly forecast: number;
  readonly signalPressure: number;
  readonly riskBands: {
    readonly green: number;
    readonly yellow: number;
    readonly red: number;
  };
};

export type PlanRunProfile = {
  readonly planId: PlanId;
  readonly runCount: number;
  readonly completedRunCount: number;
  readonly averageCompletionMinutes: number;
  readonly lastState?: RuntimeRun['state'];
  readonly readinessTrace: ReadonlyArray<PlanReadinessRecord>;
};

const readinessFromPlan = (plan: RecoveryPlan): number => {
  const actionPenalty = Math.min(plan.actions.length * 2.5, 45);
  const slaPressure = Math.max(0, (plan.slaMinutes - 180) / 6);
  const modeBonus = plan.mode === 'automated' ? 12 : plan.mode === 'semi' ? 6 : 0;
  const dependencyPressure = plan.actions.filter((action) => action.dependencies.length > 0).length * 3.5;
  const readiness = 100 - actionPenalty - slaPressure - dependencyPressure + modeBonus;
  return normalizeNumber(readiness);
};

const readinessFromEvents = (events: readonly CommandEvent[]): number => {
  if (events.length === 0) return 100;
  const failCount = events.filter((event) => event.status === 'failed').length;
  return normalizeNumber(Math.max(0, 100 - failCount * 7 - events.length * 0.35));
};

export const buildPlanReadinessTrace = async (
  store: InMemoryCockpitStore,
  planId: PlanId,
): Promise<Result<ReadonlyArray<PlanReadinessRecord>, string>> => {
  const plans = await store.getPlan(planId);
  if (!plans.ok || !plans.value) {
    return fail('plan-not-found');
  }

  const runs = await store.listRuns(planId);
  if (!runs.ok) {
    return fail(runs.error);
  }

  const events = await store.getEvents(planId, 250);
  const byRun = groupBy(events, (event) => event.runId ?? 'none');
  const records: PlanReadinessRecord[] = [];

  for (const runGroup of byRun) {
    const runEvents = [...runGroup.values];
    if (runEvents.length === 0) continue;
    const at = runEvents.at(-1)?.at ?? new Date().toISOString();
    records.push({
      planId,
      readiness: readinessFromEvents(runEvents),
      planActionCount: plans.value.actions.length,
      signalCount: runEvents.length,
      at,
    });
  }

  return ok(
    records.sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime()),
  );
};

export const runProfileFromStore = async (
  store: InMemoryCockpitStore,
  planId: PlanId,
): Promise<Result<PlanRunProfile, string>> => {
  const planResult = await store.getPlan(planId);
  if (!planResult.ok || !planResult.value) {
    return fail('plan-not-found');
  }

  const runsResult = await store.listRuns(planId);
  if (!runsResult.ok) {
    return fail(runsResult.error);
  }

  const runs = [...runsResult.value];
  const completedRuns = runs.filter((run) => run.state === 'completed');
  const completionTimes = completedRuns.map((run) => {
    const duration = run.context.source === 'cockpit-orchestrator' ? 0 : 0;
    return duration + (run.activeActionIds.length === 0 ? run.completedActions.length : 0);
  });

  const traceResult = await buildPlanReadinessTrace(store, planId);
  if (!traceResult.ok) {
    return fail(traceResult.error);
  }

  const trace = traceResult.value;
  const readinessAvg = trace.length > 0 ? trace.reduce((acc, entry) => acc + entry.readiness, 0) / trace.length : 100;
  const averages = movingAverage(
    trace.length > 0 ? trace.map((entry) => entry.readiness) : [readinessFromPlan(planResult.value)],
    4,
  );

  const riskBands = {
    green: averages.filter((value) => value >= 80).length,
    yellow: averages.filter((value) => value >= 60 && value < 80).length,
    red: averages.filter((value) => value < 60).length,
  };

  const completion = completionTimes.length > 0 ? percentile(completionTimes, 0.5) : 0;

  return ok({
    planId,
    runCount: runs.length,
    completedRunCount: completedRuns.length,
    averageCompletionMinutes: completion,
    lastState: runs.at(-1)?.state,
    readinessTrace: trace,
  });
};

export const summarizePlanHealth = async (
  store: InMemoryCockpitStore,
  planId: PlanId,
): Promise<Result<PlanHealthSummary, string>> => {
  const profile = await runProfileFromStore(store, planId);
  if (!profile.ok) {
    return fail(profile.error);
  }

  const trace = profile.value.readinessTrace;
  const values = trace.map((entry) => entry.readiness);
  const latest = trace.at(-1)?.readiness ?? 100;
  const previous = trace.at(-2)?.readiness ?? latest;
  const delta = latest - previous;
  const trend: PlanHealthSummary['trend'] = delta > 1 ? 'improving' : delta < -1 ? 'degrading' : 'stable';

  const forecast = values.length > 0 ? values.reduce((acc, value) => acc + value, 0) / values.length : 100;
  const signalPressure = trace.reduce((acc, entry) => acc + entry.signalCount, 0);
  const readinessWindow = [...values].sort((left, right) => right - left);
  const green = readinessWindow.filter((value) => value >= 80).length;
  const yellow = readinessWindow.filter((value) => value >= 60 && value < 80).length;
  const red = readinessWindow.length - green - yellow;

  return ok({
    planId,
    latestReadiness: normalizeNumber(latest),
    trend,
    forecast: Number(forecast.toFixed(2)),
    signalPressure: normalizeNumber(signalPressure),
    riskBands: {
      green,
      yellow,
      red,
    },
  });
};

export const mergeReadinessEnvelopes = (
  envelopes: readonly ReadinessEnvelope[],
): ReadonlyArray<ReadinessEnvelope> => {
  const byPlan = groupBy(envelopes, (envelope) => envelope.planId);
  const merged: ReadinessEnvelope[] = [];

  for (const group of byPlan) {
    const values = [...group.values];
    const baseline = values.reduce((acc, entry) => acc + entry.baselineScore, 0) / Math.max(1, values.length);
    const windows = values.flatMap((entry) => entry.windows);
    merged.push({
      planId: values[0]!.planId,
      namespace: values[0]!.namespace,
      baselineScore: normalizeNumber(baseline),
      windows,
    });
  }
  return merged;
};
