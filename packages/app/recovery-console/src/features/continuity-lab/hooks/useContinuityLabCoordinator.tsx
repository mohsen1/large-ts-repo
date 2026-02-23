import { useCallback, useMemo, useState } from 'react';
import {
  ContinuityControlContext,
  ContinuityEntityId,
  ContinuityLabService,
  ContinuityPlan,
  ContinuitySignal,
  ContinuityRunResult,
  runContinuityOrchestration,
} from '@domain/recovery-continuity-lab-core';

interface UseContinuityLabCoordinatorProps {
  readonly tenantId: string;
  readonly context: ContinuityControlContext;
}

interface UseContinuityLabCoordinatorReturn {
  readonly loading: boolean;
  readonly plans: ReadonlyArray<ContinuityPlan>;
  readonly runHistory: ReadonlyArray<ContinuityRunResult>;
  readonly runSummary: string;
  readonly runAll: () => Promise<void>;
  readonly reset: () => void;
}

const signals: ReadonlyArray<ContinuitySignal> = [
  {
    signalId: '11111111-1111-4111-8111-111111111111',
    streamId: 'drain-observer',
    kind: 'cpu_pressure',
    weight: 87,
    value: 87,
    source: 'telemetry',
    observedAt: new Date().toISOString(),
  },
  {
    signalId: '22222222-2222-4222-8222-222222222222',
    streamId: 'db-health',
    kind: 'replica_lag',
    weight: 72,
    value: 72,
    source: 'db',
    observedAt: new Date().toISOString(),
  },
  {
    signalId: '33333333-3333-4333-8333-333333333333',
    streamId: 'queue',
    kind: 'retry_pressure',
    weight: 61,
    value: 61,
    source: 'messaging',
    observedAt: new Date().toISOString(),
  },
];

const makePlan = (planId: ContinuityEntityId, title: string, context: ContinuityControlContext): ContinuityPlan => {
  const now = new Date().toISOString();
  return {
    planId,
    title,
    window: [
      { from: now, to: now, confidence: 0.72 },
      { from: now, to: now, confidence: 0.72 },
    ],
    snapshots: [],
    signals,
    actions: [
      {
        actionId: `${planId}-scale-readers`,
        owner: 'platform',
        title: 'scale-read-cache-readers',
        description: 'Scale read-cache readers',
        impactScore: 72,
        dependencies: [],
        preconditions: ['cpu_pressure', 'retry_pressure'],
        enabled: true,
      },
    ],
    policy: context.policy,
  };
};

export const useContinuityLabCoordinator = ({ tenantId, context }: UseContinuityLabCoordinatorProps): UseContinuityLabCoordinatorReturn => {
  const [loading, setLoading] = useState(false);
  const [runHistory, setRunHistory] = useState<ContinuityRunResult[]>([]);
  const service = useMemo(() => new ContinuityLabService(), []);

  const plans = useMemo(
    () => [
      makePlan('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Baseline stability path', context),
      makePlan('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Recovery surge mode', context),
    ],
    [context],
  );

  const runAll = useCallback(async () => {
    setLoading(true);
    try {
      const workspaceContext: ContinuityControlContext = {
        tenantId,
        topologyNodes: context.topologyNodes,
        topologyEdges: context.topologyEdges,
        policy: context.policy,
        constraints: context.constraints,
      };

      const { batchSummary } = await runContinuityOrchestration({
        context: workspaceContext,
        plans,
        signals,
        observedAt: new Date().toISOString(),
      });

      const history = await Promise.all(
        plans.map((plan) =>
          service.run({
            context: workspaceContext,
            plan,
            signals: plan.signals,
            observedAt: new Date().toISOString(),
          }),
        ),
      );

      setRunHistory((previous) => [...previous, ...history]);
      if (batchSummary.meanRisk > 0.5) {
        console.info(`batch risk high ${batchSummary.meanRisk}`);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, context, plans, service]);

  const reset = useCallback(() => {
    setRunHistory([]);
  }, []);

  const runSummary = useMemo(() => {
    if (runHistory.length === 0) {
      return 'No lab executions yet';
    }
    const latest = runHistory[runHistory.length - 1];
    const outcome = latest.outcomes[latest.outcomes.length - 1];
    return outcome
      ? `last-run risk ${outcome.risk.toFixed(2)} with ${outcome.violations.length} violations`
      : 'No outcomes available';
  }, [runHistory]);

  return {
    loading,
    plans,
    runHistory,
    runSummary,
    runAll,
    reset,
  };
};

export const ContinuityLabCoordinatorBadge = ({ children }: { children: string }) => (
  <span style={{ padding: '0.2rem 0.45rem', borderRadius: 999, border: '1px solid #334155', fontSize: '0.75rem' }}>
    {children}
  </span>
);
