import { useCallback, useEffect, useMemo, useState } from 'react';
import { type RecoveryRunbook, type StageNode } from '@domain/recovery-orchestration-design';
import { withBrand } from '@shared/core';
import { createControllerHandle, type StudioRunState } from '@service/recovery-orchestration-studio-engine';
import { buildRuntimeSignals } from '@service/recovery-orchestration-studio-engine';
import type { RecoveryPlan } from '@domain/recovery-cockpit-models';

export type OrchestratorHookInput = {
  readonly tenant: string;
  readonly workspace: string;
  readonly autoStartOnMount?: boolean;
  readonly runbooks: readonly RecoveryRunbook[];
  readonly plans?: readonly RecoveryPlan[];
};

export type OrchestratorHookOutput = {
  readonly activeId: string;
  readonly isRunning: boolean;
  readonly runs: readonly StudioRunState[];
  readonly lastRun?: StudioRunState;
  readonly start: (runbook: RecoveryRunbook) => void;
  readonly stop: () => void;
  readonly clear: () => void;
  readonly refreshDiagnostics: (runbook: RecoveryRunbook) => Promise<void>;
};

const phaseFromIndex = (index: number): StageNode['phase'] =>
  (['discover', 'stabilize', 'mitigate', 'validate', 'document'][index % 5] as StageNode['phase']);

const severityFromIndex = (index: number): StageNode['severity'] =>
  (['low', 'medium', 'high', 'critical', 'low'][index % 5] as StageNode['severity']);

const toRunbook = (plan: RecoveryPlan): RecoveryRunbook => {
  const now = new Date().toISOString();
  const nodes = plan.actions.map<StageNode>((action, index) => ({
    id: String(action.id),
    title: action.command,
    phase: phaseFromIndex(index),
    severity: severityFromIndex(index),
    status: 'pending',
    metrics: {
      slo: Math.max(0.1, 1 - index / Math.max(1, plan.actions.length)),
      capacity: Math.max(0.1, 0.95 - index / 20),
      compliance: Math.max(0.1, 1 - index / 10),
      security: 0.6,
    },
    prerequisites: action.dependencies.map((dependency) => String(dependency)),
  }));

  const edges = nodes
    .map((current, index) => ({
      from: current.id,
      to: nodes[index + 1]?.id ?? current.id,
      latencyMs: Math.max(1, (index + 1) * 77),
    }))
    .filter((edge) => edge.from !== edge.to);

  return {
    tenant: withBrand('tenant:studio', 'TenantId'),
    workspace: withBrand('workspace:studio', 'WorkspaceId'),
    scenarioId: withBrand(String(plan.planId), 'ScenarioId'),
    title: plan.title,
    nodes,
    edges,
    directives: [
      {
        code: 'policy:studio',
        command: 'studio:execute',
        scope: plan.labels.short,
        requiredCapabilities: ['orchestrator', 'planner'],
        metadata: { plan: String(plan.planId) },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
};

export const useRecoveryStudioOrchestrator = ({
  tenant,
  workspace,
  autoStartOnMount = false,
  runbooks,
  plans,
}: OrchestratorHookInput): OrchestratorHookOutput => {
  const [runs, setRuns] = useState<readonly StudioRunState[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const handle = useMemo(() => createControllerHandle(tenant, workspace), [tenant, workspace]);

  const derivedRunbooks = useMemo(() => {
    const byScenario = new Map<string, RecoveryRunbook>();
    for (const plan of plans ?? []) {
      const runbook = toRunbook(plan);
      byScenario.set(runbook.scenarioId, runbook);
    }
    for (const runbook of runbooks) {
      byScenario.set(runbook.scenarioId, runbook);
    }
    return [...byScenario.values()];
  }, [plans, runbooks]);

  const start = useCallback(
    (runbook: RecoveryRunbook): void => {
      void (async () => {
        setIsRunning(true);
        try {
          const result = await handle.start(runbook);
          setRuns((previous) => [...previous, result].slice(-12));
        } finally {
          setIsRunning(false);
        }
      })();
    },
    [handle],
  );

  const stop = useCallback(() => {
    setIsRunning(false);
    void handle.stop();
  }, [handle]);

  const clear = useCallback(() => {
    setRuns([]);
  }, []);

  const refreshDiagnostics = useCallback(
    async (runbook: RecoveryRunbook): Promise<void> => {
      const outputs = await buildRuntimeSignals({
        runbook,
        planId: `plan:${runbook.scenarioId}` as any,
        config: {
          tenant: withBrand(tenant, 'EngineTenantId'),
          workspace: withBrand(workspace, 'EngineWorkspaceId'),
          limitMs: 60_000,
          tags: ['diagnostics', runbook.scenarioId],
        },
        signalThreshold: derivedRunbooks.length,
      });

      setRuns((previous) => {
        const next: StudioRunState = {
          sessionId: `diag-${runbook.scenarioId}`,
          status: 'queued',
          ticks: [],
          telemetry: [],
          outputs,
        };
        return [...previous, next].slice(-12);
      });
    },
    [derivedRunbooks.length, tenant, workspace],
  );

  useEffect(() => {
    if (!autoStartOnMount || derivedRunbooks.length === 0) {
      return;
    }
    start(derivedRunbooks[0]!);
  }, [autoStartOnMount, derivedRunbooks.length, start]);

  return {
    activeId: runs[runs.length - 1]?.sessionId ?? 'none',
    isRunning,
    runs,
    lastRun: runs.at(-1),
    start,
    stop,
    clear,
    refreshDiagnostics,
  };
};
