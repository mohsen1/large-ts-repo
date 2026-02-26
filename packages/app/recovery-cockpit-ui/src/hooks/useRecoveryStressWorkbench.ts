import { useEffect, useMemo, useState } from 'react';
import {
  collectRoutePlans,
  getWorkloadPath,
  resolveWorkbenchInput,
  summarizeMetrics,
  warmRouteCatalog,
  type StressEvaluationResult,
  type StressPlanResult,
  type StressWorkbenchInput,
  type StressResolvedPlan,
} from '../services/recoveryCockpitStressWorkloadService';
import type { NestedMap } from '@shared/type-level';
import type {
  OrbitAction,
  OrbitRoute,
  OrbitCommandPlan,
} from '@shared/type-level';

export type StressScenarioState = 'idle' | 'warming' | 'active' | 'exhausted';
export type StressEvent =
  | 'bootstrap'
  | 'align'
  | 'reconcile'
  | 'simulate'
  | 'triage'
  | 'restore'
  | 'snapshot'
  | 'stabilize'
  | 'audit'
  | 'quarantine'
  | 'route'
  | 'scale'
  | 'secure'
  | 'visualize'
  | 'commit'
  | 'verify'
  | 'gather'
  | 'observe'
  | 'deploy'
  | 'drain'
  | 'capture';

type RouteEvent = {
  readonly route: OrbitRoute;
  readonly state: StressScenarioState;
  readonly phase: number;
  readonly event: StressEvent;
};

export type StressWorkbenchPayload = {
  readonly tenantId: string;
  readonly plans: StressResolvedPlan[];
  readonly result: StressPlanResult;
  readonly metrics: ReturnType<typeof summarizeMetrics>;
  readonly evaluation: StressEvaluationResult;
  readonly state: StressScenarioState;
  readonly activeEvents: RouteEvent[];
  readonly routeSnapshot: readonly RouteEvent[];
  readonly nested: NestedMap<{ route: string }>;
  readonly templates: OrbitRoute;
};

type RouteClassify<T extends StressEvent> = T extends 'bootstrap'
  ? 'infra'
  : T extends 'discover'
    ? 'observe'
    : T extends 'reconcile'
      ? 'control'
      : T extends 'simulate'
        ? 'analysis'
        : T extends 'triage'
          ? 'ops'
          : T extends 'restore'
            ? 'recovery'
            : T extends 'snapshot'
              ? 'state'
              : T extends 'stabilize'
                ? 'steady'
                : T extends 'audit'
                  ? 'inspect'
                  : T extends 'quarantine'
                    ? 'shield'
                    : T extends 'route'
                      ? 'egress'
                      : T extends 'scale'
                        ? 'supply'
                        : T extends 'secure'
                          ? 'defense'
                          : T extends 'visualize'
                            ? 'ux'
                            : T extends 'commit'
                              ? 'state'
                              : T extends 'verify'
                                ? 'inspect'
                                : T extends 'gather'
                                  ? 'sensing'
                                  : T extends 'observe'
                                    ? 'monitor'
                                    : T extends 'deploy'
                                      ? 'delivery'
                                      : T extends 'drain'
                                        ? 'release'
                                        : 'generic';

const classifyAction = (action: OrbitAction): RouteEvent => {
  const event: StressEvent =
    action === 'bootstrap'
      ? 'bootstrap'
      : action === 'align'
        ? 'align'
        : action === 'reconcile'
          ? 'reconcile'
          : action === 'simulate'
            ? 'simulate'
            : action === 'triage'
              ? 'triage'
              : action === 'restore'
                ? 'restore'
                : action === 'snapshot'
                  ? 'snapshot'
                  : action === 'stabilize'
                    ? 'stabilize'
                    : action === 'audit'
                      ? 'audit'
                      : action === 'quarantine'
                        ? 'quarantine'
                        : action === 'route'
                          ? 'route'
                          : action === 'scale'
                            ? 'scale'
      : action === 'secure'
        ? 'secure'
      : action === 'capture'
        ? 'capture'
        : action === 'commit'
          ? 'commit'
                                  : action === 'verify'
                                    ? 'verify'
                                    : action === 'gather'
                                      ? 'gather'
                                      : action === 'observe'
                                        ? 'observe'
                                        : action === 'deploy'
                                          ? 'deploy'
                                          : action === 'drain'
                                            ? 'drain'
                                            : 'commit';

  return {
    route: `/agent/${action}/active/alpha/agent-${action}-1` as OrbitRoute,
    state: (action.length % 4 === 0 ? 'warming' : action.length % 3 === 0 ? 'active' : 'idle') as StressScenarioState,
    phase: action.length,
    event,
  };
};

const normalizeEventWeight = (route: RouteEvent): number => {
  return (
    (route.phase > 5 ? 7 : route.state === 'active' ? 10 : route.state === 'warming' ? 6 : 3) *
    (route.event === 'triage' || route.event === 'restore' || route.event === 'simulate' ? 2 : 1)
  );
};

const routeClassifyGuard = (
  event: RouteEvent,
): event is RouteEvent & {
  readonly event: 'bootstrap' | 'restore' | 'triage' | 'simulate';
} => event.event === 'bootstrap' || event.event === 'restore' || event.event === 'triage' || event.event === 'simulate';

export const useRecoveryStressWorkbench = (tenantId: string) => {
  const [input] = useState<StressWorkbenchInput>(() => resolveWorkbenchInput(tenantId));
  const [state, setState] = useState<StressScenarioState>('idle');
  const [planResult, setPlanResult] = useState<StressPlanResult | null>(null);
  const [metricHistory, setMetricHistory] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setState('warming');
      const result = await collectRoutePlans(input);
      if (cancelled) {
        return;
      }
      setPlanResult(result);
      setState('active');
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      setState('exhausted');
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      setState('idle');
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [input]);

  const routeEvents = useMemo<RouteEvent[]>(() => warmRouteCatalog.map((entry) => classifyAction(entry.route.split('/')[2] as OrbitAction)), [input]);
  const routeSnapshot = useMemo<RouteEvent[]>(() => {
    const sorted = [...routeEvents].sort((left, right) => {
      const leftWeight = normalizeEventWeight(left);
      const rightWeight = normalizeEventWeight(right);
      return rightWeight - leftWeight;
    });
    const out: RouteEvent[] = [];
    for (const event of sorted) {
      if (routeClassifyGuard(event)) {
        out.push(event);
        continue;
      }
      if (event.state === 'active' || event.state === 'warming') {
        out.push(event);
      }
    }
    return out;
  }, [routeEvents]);

  const planCommand = useMemo<OrbitRoute>(() => routeSnapshot[0]?.route ?? '/agent/simulate/active/alpha/agent-init-0', [routeSnapshot]);

  const metrics = useMemo(() => {
    const base = planResult ? summarizeMetrics(planResult) : ({ routeCount: warmRouteCatalog.length, activeCount: 0, disabledCount: warmRouteCatalog.length, averageLatency: 0 });
    return base;
  }, [planResult]);

  const pathValue = getWorkloadPath(input, 'tenantId');

  const payload = useMemo<StressWorkbenchPayload>(() => {
    const planList = planResult ? planResult.resolved : [];
    const nested = {
      route: pathValue,
    } as unknown as NestedMap<{ route: string }>;
    const evaluation = planResult
      ? ({
          runId: planResult.runId,
          profile: 'workbench',
          ...metrics,
        }) as StressEvaluationResult
      : {
          runId: 'stress-run-main' as StressRunId,
          profile: 'inactive',
          ...metrics,
        };

    return {
      tenantId: pathValue,
      plans: planList as StressResolvedPlan[],
      result: planResult ?? {
        tenantId: input.tenantId,
        runId: input.runId,
        resolved: [],
        elapsedMs: 0,
        correlation: 0,
      },
      metrics,
      evaluation,
      state,
      activeEvents: routeSnapshot,
      routeSnapshot,
      nested: nested,
      templates: planCommand,
    };
  }, [input.tenantId, planResult, metrics, state, routeSnapshot, pathValue, planCommand]);

  useEffect(() => {
    setMetricHistory((history) => [...history, metrics.averageLatency].slice(-30));
  }, [metrics]);

  const trend = useMemo(() => {
    let down = 0;
    let up = 0;
    for (const value of metricHistory) {
      if (value > (payload.metrics.averageLatency ?? 0)) {
        up += 1;
      } else {
        down += 1;
      }
    }
    return up > down ? 'hot' : down > up ? 'cold' : 'stable';
  }, [metricHistory, payload.metrics.averageLatency]);

  return {
    payload,
    metricHistory,
    trend,
    planCount: payload.plans.length,
  };
};

type DeepPayload<T, U extends object> = {
  [K in keyof T as `path_${K & string}`]: K extends keyof U ? U[K] : never;
};

type StressRunId = import('../services/recoveryCockpitStressWorkloadService').StressRunId;
