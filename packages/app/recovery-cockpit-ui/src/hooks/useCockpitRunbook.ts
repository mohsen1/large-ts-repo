import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlanId, RecoveryPlan, ReadinessEnvelope, CommandEvent, RuntimeRun } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore, listPlans, listRuns, listEvents, queryPlansByText } from '@data/recovery-cockpit-store';
import { summarizeStrategy, buildExecutionStrategy, ExecutionStrategy } from '@service/recovery-cockpit-orchestrator';
import { summarizeChangeRequest, RunbookChangeRequest } from '@domain/recovery-cockpit-models';
import { fixturePlans } from '@data/recovery-cockpit-store';

export type CockpitRunbookState = {
  plans: ReadonlyArray<RecoveryPlan>;
  selectedPlanId: PlanId | null;
  readiness: ReadonlyArray<ReadinessEnvelope>;
  strategy: ExecutionStrategy;
  runs: ReadonlyArray<RuntimeRun>;
  events: readonly CommandEvent[];
  active: ReadonlySet<string>;
  ready: boolean;
  loading: boolean;
};

export type CockpitRunbookActions = {
  bootstrap(): Promise<void>;
  selectPlan: (planId: PlanId) => void;
  setStrategy: (strategy: ExecutionStrategy) => void;
  refresh(planId?: PlanId): Promise<void>;
  searchPlans: (text: string) => Promise<void>;
  seedChangeRequest: (request: RunbookChangeRequest) => void;
};

type ChangeRequestSummary = {
  requestId: string;
  planId: string;
  risk: 'low' | 'medium' | 'high';
  approvalRate: number;
  summary: string;
};

const mapPlanToEnvelope = (plan: RecoveryPlan): ReadinessEnvelope => ({
  planId: plan.planId,
  namespace: plan.labels.short,
  baselineScore: Math.max(1, 100 - Math.min(plan.slaMinutes, 100)),
  windows: plan.actions.map((action, index) => ({
    at: new Date(Date.now() + index * 10 * 60 * 1000).toISOString() as any,
    score: Math.max(0, 100 - index * 3 - action.expectedDurationMinutes),
    services: [action.serviceCode],
    expectedRecoveryMinutes: action.expectedDurationMinutes,
  })),
});

export const useCockpitRunbook = (): CockpitRunbookState & CockpitRunbookActions & { changeRequests: readonly ChangeRequestSummary[] } => {
  const [planStore] = useState(() => new InMemoryCockpitStore());
  const [plans, setPlans] = useState<ReadonlyArray<RecoveryPlan>>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId | null>(null);
  const [readiness, setReadiness] = useState<ReadonlyArray<ReadinessEnvelope>>([]);
  const [strategy, setStrategyState] = useState<ExecutionStrategy>('balanced');
  const [runs, setRuns] = useState<ReadonlyArray<RuntimeRun>>([]);
  const [events, setEvents] = useState<readonly CommandEvent[]>([]);
  const [active, setActive] = useState(new Set<string>());
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [changeRequests, setChangeRequests] = useState<readonly ChangeRequestSummary[]>([]);

  const seedPlans = useCallback(async () => {
    const seeds = fixturePlans();
    for (const plan of seeds) {
      await planStore.upsertPlan(plan);
    }
  }, [planStore]);

  const refresh = useCallback(async (planId?: PlanId) => {
    setLoading(true);
    const targetId = planId ?? selectedPlanId;
    const all = await listPlans(planStore);
    setPlans(all);

    if (!selectedPlanId && all.length > 0) {
      setSelectedPlanId(all[0].planId);
    }

    const computedReadiness = all.map(mapPlanToEnvelope);
    setReadiness(computedReadiness);
    if (targetId) {
      const fetchedRuns = await listRuns(planStore, { planId: targetId, includeActive: true, limit: 50 });
      const fetchedEvents = await listEvents(planStore, { planId: targetId, limit: 50 });
      setRuns(fetchedRuns as ReadonlyArray<RuntimeRun>);
      setEvents(fetchedEvents as CommandEvent[]);
    }
    setLoading(false);
  }, [planStore, selectedPlanId]);

  const searchPlansByTerm = useCallback(async (text: string) => {
    setSearchTerm(text);
    setLoading(true);
    const planIds = await queryPlansByText(planStore, text, {});
    const all = await listPlans(planStore);
    setPlans(all.filter((plan) => planIds.includes(plan.planId)));
    setLoading(false);
  }, [planStore]);

  const refreshEvents = useCallback(async (targetPlanId: PlanId) => {
    const eventsSnapshot = await listEvents(planStore, { planId: targetPlanId, limit: 200 });
    setEvents(eventsSnapshot);
  }, [planStore]);

  const seedChangeRequest = useCallback((request: RunbookChangeRequest) => {
    const summary = summarizeChangeRequest(request);
      setChangeRequests((current) => [
        ...current,
        {
          requestId: request.requestId,
          planId: request.planId,
          risk: summary.risk,
          approvalRate: summary.approvalRate,
          summary: summary.summary,
      },
    ]);
  }, []);

  useEffect(() => {
    void (async () => {
      await seedPlans();
      await refresh();
      setReady(true);
    })();
  }, [seedPlans, refresh]);

  useEffect(() => {
    if (!selectedPlanId) {
      return;
    }

    const timer = setInterval(() => {
      void refreshEvents(selectedPlanId);
    }, 3500);

    return () => clearInterval(timer);
  }, [selectedPlanId, refreshEvents]);

  const selectedPlan = useMemo(() => plans.find((plan) => plan.planId === selectedPlanId), [plans, selectedPlanId]);

  return {
    plans: plans.filter((plan) => plan.labels.short.includes(searchTextMatcher(searchTerm)) || searchTerm.length === 0),
    selectedPlanId,
    readiness,
    strategy,
    runs,
    events,
    active,
    ready,
    loading,
    changeRequests,
    bootstrap: refresh,
    selectPlan(planId) {
      setSelectedPlanId(planId);
      void refresh(planId);
    },
    setStrategy(next) {
      setStrategyState(next);
      if (selectedPlan) {
        summarizeStrategy(selectedPlan, buildExecutionStrategy(selectedPlan, next));
      }
    },
    refresh,
    searchPlans: searchPlansByTerm,
    seedChangeRequest,
  };
};

const searchTextMatcher = (searchText: string): string => searchText.trim().toLowerCase();
