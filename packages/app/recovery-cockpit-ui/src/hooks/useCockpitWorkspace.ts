import { useMemo, useState } from 'react';
import { RecoveryCockpitOrchestrator, OrchestratorConfig } from '@service/recovery-cockpit-orchestrator';
import { createInMemoryWorkspace } from '@service/recovery-cockpit-orchestrator';
import { RecoveryPlan, ReadinessEnvelope, toTimestamp } from '@domain/recovery-cockpit-models';
import { fixturePlans, InMemoryCockpitStore } from '@data/recovery-cockpit-store';

export type CockpitWorkspaceState = {
  ready: boolean;
  plans: RecoveryPlan[];
  selectedPlanId: string;
  readiness: ReadonlyArray<ReadinessEnvelope>;
};

export type CockpitWorkspaceActions = {
  bootstrap(): Promise<void>;
  selectPlan(planId: string): void;
  startPlan(planId: string): Promise<void>;
  refresh(): Promise<void>;
};

export const useCockpitWorkspace = (config: Partial<OrchestratorConfig> = {}): CockpitWorkspaceState & CockpitWorkspaceActions => {
  const [ready, setReady] = useState(false);
  const [plans, setPlans] = useState<RecoveryPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [readiness, setReadiness] = useState<ReadonlyArray<ReadinessEnvelope>>([]);

  const store = useMemo(() => new InMemoryCockpitStore(), []);
  const workspace = useMemo(() => createInMemoryWorkspace(store), [store]);
  const orchestrator = useMemo(() => new RecoveryCockpitOrchestrator(workspace, workspace.clock, config), [workspace, config]);

  const bootstrap = async () => {
    const seed = fixturePlans();
    for (const plan of seed) {
      await workspace.store.upsertPlan(plan);
    }
    const allPlans = await store.listPlans();
    if (!allPlans.ok) {
      return;
    }

    setPlans(allPlans.value);
    if (!selectedPlanId && allPlans.value.length > 0) {
      setSelectedPlanId(allPlans.value[0].planId);
    }
    setReadiness(
      allPlans.value.map((plan) => ({
        planId: plan.planId,
        namespace: 'ops',
        windows: plan.actions.map((action, index) => ({
          at: toTimestamp(new Date(Date.now() + index * 10 * 60 * 1000)),
          score: Math.max(5, 100 - index * 4 - action.expectedDurationMinutes),
          services: [action.serviceCode],
          expectedRecoveryMinutes: action.expectedDurationMinutes,
        })),
        baselineScore: orchestrator.estimateHealth(plan),
      })),
    );
    setReady(true);
  };

  const selectPlan = (planId: string) => {
    setSelectedPlanId(planId);
  };

  const startPlan = async (planId: string) => {
    const found = plans.find((plan) => plan.planId === planId);
    if (!found) {
      return;
    }
    const started = await orchestrator.start(found);
    if (started.ok) {
      await refresh();
    }
  };

  const refresh = async () => {
    const snapshot = await store.listPlans();
    if (!snapshot.ok) {
      return;
    }
    setPlans(snapshot.value);
  };

  return {
    ready,
    plans,
    selectedPlanId,
    readiness,
    bootstrap,
    selectPlan,
    startPlan,
    refresh,
  };
};
