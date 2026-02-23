import { useCallback, useEffect, useMemo, useState } from 'react';
import { CockpitSignal, RecoveryPlan, CommandEvent, RuntimeRun, toTimestamp } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore, fixturePlans } from '@data/recovery-cockpit-store';
import { InMemoryCockpitInsightsStore, createInsightFacade, listInsights } from '@data/recovery-cockpit-insights';
import { RecoveryCockpitOrchestrator, OrchestratorConfig } from '@service/recovery-cockpit-orchestrator';
import { createInMemoryWorkspace, buildDirectorPlan, type DirectorConfig, type DirectorPlan } from '@service/recovery-cockpit-orchestrator';
import { assessPlan, DecisionResult } from '@service/recovery-cockpit-orchestrator';
import { buildSlISchedule } from '@domain/recovery-cockpit-workloads';
import { buildReadinessProjection, buildRiskForecast } from '@domain/recovery-cockpit-intelligence';

export type CockpitControlAction = {
  readonly planId: string;
  readonly action: 'seed' | 'start' | 'refresh' | 'pause';
  readonly at: string;
};

export type CockpitControlRun = {
  readonly runId: string;
  readonly planId: string;
  readonly state: RuntimeRun['state'];
  readonly startedAt: string;
};

export type CockpitControlState = {
  readonly ready: boolean;
  readonly plans: readonly RecoveryPlan[];
  readonly selectedPlanId: string;
  readonly runs: readonly CockpitControlRun[];
  readonly decisions: readonly DecisionResult[];
  readonly sliSchedules: readonly ReturnType<typeof buildSlISchedule>[];
  readonly riskSnapshots: readonly ReturnType<typeof buildRiskForecast>[];
  readonly readinessWindows: Record<string, readonly { at: Date; value: number }[]>;
  readonly controlLog: readonly CockpitControlAction[];
  readonly directorPlans: readonly DirectorPlan[];
  readonly insightsCount: number;
};

export type CockpitControlOps = {
  bootstrap(): Promise<void>;
  refresh(): Promise<void>;
  runPlan(planId: string): Promise<void>;
  pausePlan(planId: string): void;
  setSelectedPlanId(planId: string): void;
};

const DEFAULT_DIRECTOR: Partial<DirectorConfig> = {
  prioritizeCapacity: true,
  includeSla: true,
  targetMode: 'balanced',
};

const unique = (values: readonly string[]) => [...new Set(values)];

const normalizeSignals = (events: readonly CommandEvent[]): CockpitSignal[] =>
  events
  .map((event) => ({
      eventId: event.eventId,
      planId: event.planId,
      runId: event.runId ?? event.eventId,
      actionId: event.actionId,
      at: event.at,
      status: event.status,
      reason: event.reason ?? 'runtime',
      severity: (event.status === 'failed' || event.status === 'cancelled' ? 'critical' : 'info') as unknown as 'critical' | 'warning' | 'notice' | 'info',
      title: `event:${event.status}`,
      source: 'orchestrator',
      body: event.reason ?? 'no reason',
      score: 10,
      code: event.status,
      message: event.reason ?? 'no message',
      relatedActions: [],
    } as unknown as CockpitSignal));

export const useCockpitControlLoop = (config: Partial<OrchestratorConfig> = {}): CockpitControlState & CockpitControlOps => {
  const [ready, setReady] = useState(false);
  const [plans, setPlans] = useState<RecoveryPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [runs, setRuns] = useState<readonly CockpitControlRun[]>([]);
  const [decisions, setDecisions] = useState<DecisionResult[]>([]);
  const [sliSchedules, setSliSchedules] = useState<ReturnType<typeof buildSlISchedule>[]>([]);
  const [riskSnapshots, setRiskSnapshots] = useState<ReturnType<typeof buildRiskForecast>[]>([]);
  const [readinessWindows, setReadinessWindows] = useState<Record<string, readonly { at: Date; value: number }[]>>({});
  const [controlLog, setControlLog] = useState<readonly CockpitControlAction[]>([]);
  const [directorPlans, setDirectorPlans] = useState<readonly DirectorPlan[]>([]);
  const [insightsCount, setInsightsCount] = useState(0);

  const store = useMemo(() => new InMemoryCockpitStore(), []);
  const insightsStore = useMemo(() => new InMemoryCockpitInsightsStore(), []);
  const workspace = useMemo(() => createInMemoryWorkspace(store), [store]);
  const orchestrator = useMemo(() => new RecoveryCockpitOrchestrator(workspace, workspace.clock, config), [workspace, config]);
  const facade = useMemo(() => createInsightFacade(store, insightsStore), [store, insightsStore]);

  const bootstrap = useCallback(async () => {
    const seed = fixturePlans();
    for (const plan of seed) {
      await workspace.store.upsertPlan(plan);
    }

    const response = await store.listPlans();
    if (!response.ok) {
      return;
    }

    const resolvedPlans = response.value;
    setPlans(resolvedPlans);
    if (!selectedPlanId && resolvedPlans.length > 0) {
      setSelectedPlanId(resolvedPlans[0].planId);
    }

    const list = await listInsights(store, {});
    setInsightsCount(list.length);

    const director = await buildDirectorPlan(resolvedPlans, DEFAULT_DIRECTOR, store);
    setDirectorPlans(director);
    setReady(true);

    setControlLog((current) => [...current, { planId: 'workspace', action: 'seed', at: toTimestamp(new Date()) }]);
    await refresh();
    void facade.describePlan(resolvedPlans[0] as RecoveryPlan);
  }, [workspace.store, store, selectedPlanId, facade]);

  const refresh = useCallback(async () => {
    const response = await store.listPlans();
    if (!response.ok) {
      return;
    }

    const currentPlans = response.value;

    const projected = await Promise.all(currentPlans.map(async (plan) => {
      const events = await store.getEvents(plan.planId, 250);
      const runRows = await store.listRuns(plan.planId);
      const lastRun = runRows.ok ? runRows.value.at(-1) : undefined;
      const decision = await assessPlan(
        {
          plan,
          signalsCount: events.length,
          recentRun: lastRun,
          events,
        },
        store,
        insightsStore,
      );
      const readiness = buildReadinessProjection(plan, plan.mode === 'automated' ? 'automated' : 'manual');
      const risk = buildRiskForecast(plan, 'advisory', normalizeSignals(events));

      const runRowsState = runRows.ok ? runRows.value : [];
      const normalizedRuns: CockpitControlRun[] = runRowsState.map((run): CockpitControlRun => ({
        runId: run.runId as string,
        planId: run.planId,
        state: run.state,
        startedAt: run.startedAt,
      }));

      return {
        plan,
        events,
        decision,
        readiness,
        risk,
        runs: normalizedRuns,
        sli: buildSlISchedule(plan),
      };
    }));

    const nextReadiness: Record<string, readonly { at: Date; value: number }[]> = {};
    const nextDecisions: DecisionResult[] = [];
    const nextSlis: ReturnType<typeof buildSlISchedule>[] = [];
    const nextRisks: ReturnType<typeof buildRiskForecast>[] = [];
    const nextRuns: CockpitControlRun[] = [];

    for (const entry of projected) {
      nextReadiness[entry.plan.planId] = entry.readiness;
      nextDecisions.push(entry.decision);
      nextSlis.push(entry.sli);
      nextRisks.push(entry.risk);
      nextRuns.push(...entry.runs);
    }

    setReadinessWindows(nextReadiness);
    setDecisions(nextDecisions);
    setSliSchedules(nextSlis);
    setRiskSnapshots(nextRisks);
    setRuns(unique(nextRuns.map((run) => run.runId)).map((runId) => nextRuns.find((run) => run.runId === runId) as CockpitControlRun));

    const director = await buildDirectorPlan(currentPlans, DEFAULT_DIRECTOR, store);
    setDirectorPlans(director);

    const latest = await listInsights(store, {});
    setInsightsCount(latest.length);

    setControlLog((current) => [...current, { planId: currentPlans[0]?.planId ?? 'none', action: 'refresh', at: toTimestamp(new Date()) }]);
  }, [store, insightsStore]);

  const runPlan = useCallback(async (planId: string) => {
    const selected = plans.find((candidate) => candidate.planId === planId);
    if (!selected) {
      return;
    }
    const started = await orchestrator.start(selected);
    if (!started.ok) {
      return;
    }
    await refresh();
  }, [plans, orchestrator, refresh]);

  const pausePlan = useCallback((planId: string) => {
    const run = runs.find((entry) => entry.planId === planId);
    if (!run) {
      return;
    }
    void orchestrator.abort(run.runId);
    setControlLog((current) => [...current, { planId, action: 'pause', at: toTimestamp(new Date()) }]);
  }, [orchestrator, runs]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const id = setInterval(() => {
      void refresh();
    }, 4500);
    return () => clearInterval(id);
  }, [ready, refresh]);

  return {
    ready,
    plans,
    selectedPlanId,
    runs,
    decisions,
    sliSchedules,
    riskSnapshots,
    readinessWindows,
    controlLog,
    directorPlans,
    insightsCount,
    bootstrap,
    refresh,
    runPlan,
    pausePlan,
    setSelectedPlanId,
  };
};
