import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  OrchestratorConfig,
} from '@service/recovery-cockpit-orchestrator';
import { RecoveryPlan, RuntimeRun, PlanId } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { InMemoryCockpitInsightsStore } from '@data/recovery-cockpit-insights';
import { createControlPlane, ControlEvent } from '@service/recovery-cockpit-orchestrator';
import { fixturePlans } from '@data/recovery-cockpit-store';
import { summarizePlanHealth, PlanHealthSummary, buildPlanTimeline } from '@data/recovery-cockpit-store';

export type DirectorState = {
  ready: boolean;
  plans: readonly RecoveryPlan[];
  selectedPlanId: PlanId;
  events: readonly ControlEvent[];
  lastRuns: readonly RuntimeRun[];
  latestSummaries: Readonly<Record<string, PlanHealthSummary>>;
  readyLines: ReadonlyArray<TimelineSnapshot>;
  planReady: boolean;
  bootstrapReady: boolean;
};

export type TimelineSnapshot = {
  readonly planId: PlanId;
  readonly markerCount: number;
};

export type DirectorActions = {
  bootstrap(): Promise<void>;
  selectPlan(planId: PlanId): void;
  execute(planId: PlanId): Promise<void>;
  reroute(planId: PlanId): Promise<void>;
  refreshTimeline(planId: PlanId): Promise<void>;
};

const createDirectorStore = (): { store: InMemoryCockpitStore; insights: InMemoryCockpitInsightsStore } => {
    const store = new InMemoryCockpitStore();
    const insights = new InMemoryCockpitInsightsStore();
    return { store, insights };
  };

export const useCockpitDirector = (_config: Partial<OrchestratorConfig> = {}): DirectorState & DirectorActions => {
  const [ready, setReady] = useState(false);
  const [plans, setPlans] = useState<readonly RecoveryPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('' as PlanId);
  const [events, setEvents] = useState<readonly ControlEvent[]>([]);
  const [latestSummaries, setLatestSummaries] = useState<Record<string, PlanHealthSummary>>({});
  const [readyLines, setReadyLines] = useState<readonly TimelineSnapshot[]>([]);
  const [planReady, setPlanReady] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);

  const infra = useMemo(() => createDirectorStore(), []);
  const controlPlane = useMemo(() => createControlPlane(infra.store, infra.insights), [infra]);

  const bootstrap = useCallback(async () => {
    const seed = fixturePlans();
    for (const plan of seed) {
      await infra.store.upsertPlan(plan);
    }
    const snapshot = await infra.store.listPlans();
    if (!snapshot.ok) return;
    setPlans(snapshot.value);
    setSelectedPlanId((snapshot.value[0]?.planId ?? '') as PlanId);
    setReady(true);
    setBootstrapReady(true);
  }, [infra]);

  const selectPlan = (planId: PlanId) => {
    setSelectedPlanId(planId);
  };

  const recomputeSummary = useCallback(
    async (planId: PlanId) => {
      const health = await summarizePlanHealth(infra.store, planId);
      if (health.ok) {
        setLatestSummaries((current) => ({
          ...current,
          [planId]: health.value,
        }));
      }
    },
    [infra],
  );

  const refreshTimeline = useCallback(
    async (planId: PlanId) => {
      const timeline = await buildPlanTimeline(infra.store, planId);
      setReadyLines((current) => [
        ...current.filter((entry) => entry.planId !== planId),
        { planId, markerCount: timeline.length },
      ]);
    },
    [infra],
  );

  const execute = useCallback(
    async (planId: PlanId) => {
      const plan = plans.find((candidate) => candidate.planId === planId);
      if (!plan) return;
      const control = await controlPlane.executePlan(plan);
      setEvents(control.events);
      const healthPlan = await infra.store.getPlan(planId);
      setPlanReady(healthPlan.ok && !!healthPlan.value);
      await recomputeSummary(planId);
      await refreshTimeline(planId);
    },
    [controlPlane, infra, plans, recomputeSummary, refreshTimeline],
  );

  const reroute = useCallback(
    async (planId: PlanId) => {
      await controlPlane.reroute(planId);
      await recomputeSummary(planId);
    },
    [controlPlane, recomputeSummary],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }
    const timer = setInterval(() => {
      setEvents((current) => [...current].slice(-50));
    }, 1000);
    return () => clearInterval(timer);
  }, [ready]);

  return {
    ready,
    plans,
    selectedPlanId,
    events,
    latestSummaries,
    readyLines,
    planReady,
    bootstrapReady,
    bootstrap,
    selectPlan,
    execute,
    reroute,
    refreshTimeline,
    lastRuns: [],
  };
};
