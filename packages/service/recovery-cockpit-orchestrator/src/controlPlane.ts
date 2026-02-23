import { InMemoryCockpitStore, InMemoryCockpitStore as StoreFacade } from '@data/recovery-cockpit-store';
import { InMemoryCockpitInsightsStore } from '@data/recovery-cockpit-insights';
import { RecoveryPlan, PlanId } from '@domain/recovery-cockpit-models';
import { buildOrchestrationBoard } from '@data/recovery-cockpit-analytics';
import { buildDirectiveContext, buildRunDirectives, summarizeDirectives } from './directiveEngine';
import { runPlanWithBundle, RunbookBundle } from './runbookOrchestrator';
import { summarizePlanHealth } from '@data/recovery-cockpit-store';

export type ControlEvent = {
  readonly kind: 'started' | 'finished' | 'failed' | 'blocked';
  readonly planId: PlanId;
  readonly runId: string;
  readonly note: string;
};

export type ControlResult = {
  readonly boardGeneratedAt: string;
  readonly runbookCount: number;
  readonly healthSnapshot: Awaited<ReturnType<typeof summarizePlanHealth>>;
  readonly events: readonly ControlEvent[];
  readonly bundles: readonly RunbookBundle[];
};

type ControlState = {
  active: Map<PlanId, RunbookBundle>;
  events: ControlEvent[];
  bundles: RunbookBundle[];
};

export const createControlPlane = (store: StoreFacade, insightStore: InMemoryCockpitInsightsStore) => {
  const state: ControlState = {
    active: new Map(),
    events: [],
    bundles: [],
  };

  const executePlan = async (plan: RecoveryPlan): Promise<ControlResult> => {
    const context = await buildDirectiveContext(store, plan);
    const directives = buildRunDirectives(context);
    const summary = summarizeDirectives(directives);

    if (summary.directivesSeverity === 'critical') {
      const blocked: ControlEvent = {
        kind: 'blocked',
        planId: plan.planId,
        runId: `blocked:${plan.planId}`,
        note: `critical directives count=${summary.directives.length}`,
      };
      state.events.push(blocked);
      return finalize(plan.planId, [blocked]);
    }

    const bundle = await runPlanWithBundle(store, plan);
    if (!bundle) {
      const failed: ControlEvent = {
        kind: 'failed',
        planId: plan.planId,
        runId: `failed:${plan.planId}`,
        note: 'orchestrator start failed',
      };
      state.events.push(failed);
      return finalize(plan.planId, [failed]);
    }

    state.bundles.push(bundle);
    state.active.set(plan.planId, bundle);
    state.events.push({
      kind: 'started',
      planId: plan.planId,
      runId: bundle.run.runId,
      note: `events=${bundle.events.length}`,
    });
    state.events.push({
      kind: 'finished',
      planId: plan.planId,
      runId: bundle.run.runId,
      note: `forecast=${bundle.forecastScore.toFixed(2)} trend=${bundle.trend}`,
    });

    return finalize(plan.planId, []);
  };

  const finalize = async (planId: PlanId, supplemental: readonly ControlEvent[]): Promise<ControlResult> => {
    const board = await buildOrchestrationBoard(store, insightStore);
    const healthSnapshot = await summarizePlanHealth(store, planId);
    return {
      boardGeneratedAt: board.generatedAt,
      runbookCount: state.bundles.length,
      healthSnapshot,
      events: [...state.events, ...supplemental],
      bundles: state.active.has(planId) ? [state.active.get(planId)!] : [],
    };
  };

  const healthByPlan = async (planId: PlanId) => summarizePlanHealth(store, planId);

  return {
    executePlan,
    reroute: async (planId: PlanId) => {
      const removed = state.active.get(planId);
      state.active.delete(planId);
      if (removed) {
        state.events.push({
          kind: 'blocked',
          planId,
          runId: removed.run.runId,
          note: 'manual reroute requested',
        });
      }
    },
    healthByPlan,
    getEvents: () => [...state.events],
  };
};
