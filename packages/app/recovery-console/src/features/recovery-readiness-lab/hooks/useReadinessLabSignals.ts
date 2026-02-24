import { useCallback, useMemo, useState, useTransition } from 'react';
import {
  ReadinessLabGraph,
  buildPluginOrder,
  buildReadinessLabManifest,
  makeReadinessLabNamespace,
  type ReadinessLabExecutionInput,
  type ReadinessLabRunId,
  type ReadinessPolicy,
  type ReadinessLabStep,
} from '@domain/recovery-readiness';
import { runReadinessLabOrchestration } from '@service/recovery-readiness-orchestrator/lab-orchestrator';
import { buildOrderedSteps } from '../plugins';
import type { ReadinessLabDashboardState } from '../types';

interface UseReadinessLabSignalsOptions {
  tenant: string;
  namespace: string;
  steps?: ReadonlyArray<ReadinessLabStep>;
}

export interface UseReadinessLabSignalsState {
  readonly state: ReadinessLabDashboardState;
  readonly running: boolean;
  readonly diagnostics: readonly string[];
  readonly canRun: boolean;
  readonly runNow: () => Promise<void>;
  readonly setState: (state: ReadinessLabDashboardState) => void;
}

const fallbackPolicy = (tenant: string): ReadinessPolicy => ({
  policyId: `${tenant}-policy`,
  name: `${tenant} default policy`,
  constraints: {
    minWindowMinutes: 10,
    maxWindowMinutes: 180,
    minTargetCoveragePct: 0.75,
    forbidParallelity: true,
    key: 'policy',
  },
  allowedRegions: new Set(['us-east-1', 'us-west-2']),
  blockedSignalSources: ['manual-check'],
});

const buildReadinessInput = (tenant: string, namespace: string, runId: ReadinessLabRunId): ReadinessLabExecutionInput => {
  const plan = {
    planId: `${tenant}:readiness-plan:${runId}` as ReadinessLabExecutionInput['plan']['planId'],
    runId,
    title: 'Readiness Run',
    objective: 'Synthesize readiness graph and generate deterministic signal slices',
    state: 'draft' as ReadinessLabExecutionInput['plan']['state'],
    createdAt: new Date().toISOString(),
    targets: [
      {
        id: `${runId}:target:us-east` as ReadinessLabExecutionInput['plan']['targets'][number]['id'],
        name: 'Primary Edge Region',
        ownerTeam: tenant,
        region: 'us-east-1',
        criticality: 'high',
        owners: [tenant],
      },
    ],
    windows: [],
    signals: [],
    riskBand: 'green',
    metadata: {
      owner: tenant,
      tags: ['synthetic', 'console'],
    },
  } as ReadinessLabExecutionInput['plan'];
  

  return {
    context: {
      tenant,
      namespace: makeReadinessLabNamespace(tenant, namespace),
      runId,
      policy: fallbackPolicy(tenant),
      enabledChannels: new Set(['telemetry', 'signal', 'playbook']),
      runLimit: 9,
    },
    plan: plan,
    directives: [],
    targetSnapshot: [],
  };
};

const emptySignalsState: ReadinessLabDashboardState = {
  workspaceId: 'tenant-lab:no-run' as ReadinessLabDashboardState['workspaceId'],
  events: [],
  pluginStates: [],
  alerts: [],
  diagnostics: [],
};

export const useReadinessLabSignals = (options: UseReadinessLabSignalsOptions): UseReadinessLabSignalsState => {
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [state, setStateInternal] = useState<ReadinessLabDashboardState>(emptySignalsState);

  const orderedSteps = useMemo(() => buildPluginOrder(options.steps ?? buildOrderedSteps()), [options.steps]);

  const runNow = useCallback(async () => {
    setRunning(true);
    try {
      const tenant = options.tenant.trim();
      const namespace = options.namespace.trim();
      const steps: ReadinessLabStep[] = (options.steps ?? buildOrderedSteps()) as ReadinessLabStep[];
      const runId = `${tenant}:${namespace}:${Date.now()}` as ReadinessLabRunId;
      const manifest = buildReadinessLabManifest({
        tenant,
        namespace,
        runId,
        steps,
      });
      const executionInput = buildReadinessInput(tenant, namespace, manifest.runId);
      const graph = new ReadinessLabGraph(manifest.runId, steps, steps.map((step, index) => ({ step, index, score: index + 1 })));

      const orchestrationResult = await runReadinessLabOrchestration(
        {
          tenant,
          namespace,
          steps,
          planId: `${tenant}:plan:${runId}`,
        },
        executionInput,
      );

      if (orchestrationResult.ok) {
        const { value } = orchestrationResult;
        setStateInternal({
          workspaceId: value.workspaceId,
          events: value.executed,
          pluginStates: value.executed.map((execution, index) => ({
            id: `${tenant}:${value.workspaceId}:${index}`,
            name: execution.planId,
            enabled: true,
            state: 'complete',
            warnings: execution.warnings,
          })),
          alerts: [`run-complete:${value.workspaceId}`, `steps=${value.executed.length}`],
          diagnostics: [...value.diagnostics, ...orderedSteps, `nodes=${graph.snapshot().nodeCount}`],
        });
      } else {
        setStateInternal((current) => ({
          ...current,
          alerts: ['orchestration-failed'],
          diagnostics: [String(orchestrationResult.error.message)],
          pluginStates: [
            {
              id: `${tenant}:fatal`,
              name: 'orchestrator',
              enabled: false,
              state: 'error',
              warnings: ['orchestration-error'],
            },
          ],
        }));
      }
    } finally {
      setRunning(false);
    }
  }, [options.namespace, options.steps, options.tenant, orderedSteps]);

  const setState = useCallback(
    (next: ReadinessLabDashboardState) => {
      startTransition(() => {
        setStateInternal(next);
      });
    },
    [startTransition],
  );

  return useMemo(
    () => ({
      state,
      running: running || isPending,
      canRun: tenantHasValue(options.tenant) && tenantHasValue(options.namespace),
      diagnostics: state.diagnostics,
      runNow,
      setState,
    }),
    [isPending, options.namespace, options.tenant, running, runNow, setState, state],
  );
};

const tenantHasValue = (value: string): value is Readonly<`${string}`> => value.trim().length > 0;
