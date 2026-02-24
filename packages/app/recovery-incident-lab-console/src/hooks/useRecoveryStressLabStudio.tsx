import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createStudioOrchestrator,
  type OrchestratorHistoryItem,
  type StudioOrchestratorInput,
  type StudioOrchestratorResult,
} from '@service/recovery-stress-lab-orchestrator';
import { makeInsights, inspectSimulation, type StudioInsightPayload } from '@service/recovery-stress-lab-orchestrator';
import {
  CommandRunbook,
  createRunbookId,
  createWorkloadId,
  createSignalId,
  createTenantId,
  type RecoverySignal,
  type WorkloadTarget,
} from '@domain/recovery-stress-lab';
import { type StudioStage } from '@service/recovery-stress-lab-orchestrator';

interface LabData {
  readonly tenantId: string;
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: readonly WorkloadTarget[];
  readonly signals: readonly RecoverySignal[];
}

type Stage = 'idle' | 'running' | 'ready' | 'error';

interface HookState {
  readonly stage: Stage;
  readonly result: StudioOrchestratorResult | null;
  readonly signals: readonly RecoverySignal[];
  readonly runbooks: readonly CommandRunbook[];
  readonly logs: readonly string[];
  readonly planCount: number;
  readonly simulationSummary: string;
}

interface HistoryBucket {
  readonly events: readonly OrchestratorHistoryItem[];
  readonly signature: string;
}

const buildRunbooks = (): CommandRunbook[] =>
  [
    {
      id: createRunbookId('studio-runbook-1'),
      tenantId: createTenantId('studio-tenant-default'),
      name: 'Rebuild control plane',
      description: 'recreate stale control nodes and rebind policies',
      steps: [],
      ownerTeam: 'recovery-core',
      cadence: {
        weekday: 1,
        windowStartMinute: 0,
        windowEndMinute: 5,
      },
    },
    {
      id: createRunbookId('studio-runbook-2'),
      tenantId: createTenantId('studio-tenant-default'),
      name: 'Cutover validation pass',
      description: 'run synthetic failover and verify end-to-end',
      steps: [],
      ownerTeam: 'recovery-core',
      cadence: {
        weekday: 2,
        windowStartMinute: 15,
        windowEndMinute: 25,
      },
    },
    {
      id: createRunbookId('studio-runbook-3'),
      tenantId: createTenantId('studio-tenant-default'),
      name: 'Rollback readiness check',
      description: 'validate rollback signals before finalization',
      steps: [],
      ownerTeam: 'recovery-safety',
      cadence: {
        weekday: 3,
        windowStartMinute: 12,
        windowEndMinute: 18,
      },
    },
  ] satisfies readonly CommandRunbook[];

const buildTopology = (): WorkloadTarget[] => [
  {
    tenantId: createTenantId('studio-tenant-default'),
    workloadId: createWorkloadId('topology-node-a'),
    commandRunbookId: createRunbookId('studio-runbook-1'),
    name: 'api-gateway',
    criticality: 5,
    region: 'us-east-1',
    azAffinity: ['a', 'b'],
    baselineRtoMinutes: 2,
    dependencies: [createWorkloadId('studio-node-topology')],
  },
  {
    tenantId: createTenantId('studio-tenant-default'),
    workloadId: createWorkloadId('topology-node-b'),
    commandRunbookId: createRunbookId('studio-runbook-2'),
    name: 'billing-api',
    criticality: 4,
    region: 'us-east-1',
    azAffinity: ['b', 'c'],
    baselineRtoMinutes: 3,
    dependencies: [createWorkloadId('studio-node-topology')],
  },
];

const buildSignals = (): RecoverySignal[] => [
  {
    id: createSignalId('signal:topology'),
    class: 'availability',
    severity: 'high',
    title: 'availability dip',
    createdAt: new Date().toISOString(),
    metadata: { weight: 4, source: 'synthetic', channel: 'studio' },
  },
  {
    id: createSignalId('signal:latency'),
    class: 'performance',
    severity: 'medium',
    title: 'inter-zone latency elevated',
    createdAt: new Date(Date.now() - 3_000).toISOString(),
    metadata: { weight: 2, source: 'watcher', channel: 'studio' },
  },
  {
    id: createSignalId('signal:integrity'),
    class: 'integrity',
    severity: 'low',
    title: 'checksum mismatch candidate',
    createdAt: new Date(Date.now() - 8_000).toISOString(),
    metadata: { weight: 1, source: 'agent', channel: 'studio' },
  },
];

const normalizePayload = (value: string): string => value.trim().toLowerCase();

const pickTop = (signals: readonly RecoverySignal[]) => signals.slice(0, 2);

const buildSeedInput = (): LabData => ({
  tenantId: 'studio-tenant-default',
  runbooks: buildRunbooks(),
  topology: buildTopology(),
  signals: buildSignals(),
});

const buildInput = (state: HookState): StudioOrchestratorInput => ({
  tenantId: createTenantId(normalizePayload(state.runbooks[0]?.tenantId ?? 'studio-tenant-default')),
  runbooks: state.runbooks,
  topology: pickTop(state.signals).map((signal, index) => ({
    tenantId: createTenantId(signal.id),
    workloadId: createWorkloadId(`workload-${signal.id}`),
    commandRunbookId: state.runbooks[index]?.id ?? createRunbookId('topology-default'),
    name: signal.title,
    criticality: 2,
    region: signal.class,
    azAffinity: ['a', 'b'],
    baselineRtoMinutes: 4,
    dependencies: [createWorkloadId('studio-node-topology')],
  })),
  signals: pickTop(state.signals),
});

const mapPayload = (result: StudioOrchestratorResult | null): readonly string[] => {
  if (!result) {
    return [];
  }

  return [
    `signature=${result.manifestSignature}`,
    `events=${result.events.length}`,
    `triage=${result.plansTriage.length}`,
    `ready=${result.snapshot.ready}`,
  ];
};

export const useRecoveryStressLabStudio = () => {
  const [state, setState] = useState<HookState>({
    stage: 'idle',
    result: null,
    signals: buildSeedInput().signals,
    runbooks: buildSeedInput().runbooks,
    logs: ['ready'],
    planCount: 0,
    simulationSummary: 'idle',
  });

  const [history, setHistory] = useState<HistoryBucket>({
    events: [],
    signature: '',
  });

  const input = useMemo(() => buildInput(state), [state.runbooks, state.signals]);

  useEffect(() => {
    setState((current) => ({
      ...current,
      planCount: current.result?.snapshot.plan?.runbooks.length ?? 0,
      simulationSummary: inspectSimulation(current.result?.snapshot.simulation ?? null),
    }));
  }, [state.result]);

  const run = useCallback(async () => {
    setState((current) => ({ ...current, stage: 'running', logs: ['running'] }));

    try {
      const orchestrator = createStudioOrchestrator();
      const result = await orchestrator.run(input);

      const topology = input.topology.map((entry) => entry.workloadId);
      const payload: StudioInsightPayload = makeInsights(
        input.tenantId,
        result.snapshot.plan,
        result.snapshot.simulation,
        input.signals,
      );

      setHistory({
        events: result.events
          .map((event, index) => ({
            at: new Date().toISOString(),
            stage: 'report' as StudioStage,
            planSet: index,
          }))
          .slice(0, 16),
        signature: payload.signature,
      });

      setState((current) => ({
        ...current,
        stage: 'ready',
        result,
        planCount: result.snapshot.plan ? result.snapshot.plan.runbooks.length : 0,
        simulationSummary: inspectSimulation(result.snapshot.simulation),
        logs: [...current.logs, `run complete signatures=${payload.signature.slice(0, 40)}`, ...topology],
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        stage: 'error',
        logs: [...current.logs, error instanceof Error ? error.message : 'studio failed'],
      }));
    }
  }, [input]);

  const updateTenant = useCallback((tenantId: string) => {
    const current = buildSeedInput();
    setState((previous) => ({
      ...previous,
      signals: current.signals,
      runbooks: current.runbooks.map((entry) => ({ ...entry, tenantId: createTenantId(tenantId) })),
      logs: [...previous.logs, `tenant switched: ${tenantId}`],
    }));
  }, []);

  const addSignal = useCallback((severity: 'low' | 'medium' | 'high' | 'critical') => {
    const id = `studio-extra-${Date.now()}`;
    setState((previous) => ({
      ...previous,
      signals: [
        ...previous.signals,
        {
          id: createSignalId(id),
          class: 'availability',
          severity,
          title: `manual-${id}`,
          createdAt: new Date().toISOString(),
          metadata: { weight: 1 },
        },
      ],
      logs: [...previous.logs, `signal added: ${id}`],
    }));
  }, []);

  const reset = useCallback(() => {
    const seed = buildSeedInput();
    setState({
      stage: 'idle',
      result: null,
      signals: seed.signals,
      runbooks: seed.runbooks,
      logs: ['reset'],
      planCount: 0,
      simulationSummary: 'reset',
    });
    setHistory({ events: [], signature: '' });
  }, []);

  const payload = mapPayload(state.result);
  const summary = useMemo(() => `${state.planCount} plans, ${state.signals.length} signals`, [state.planCount, state.signals.length]);

  return {
    state,
    history,
    input,
    run,
    updateTenant,
    addSignal,
    reset,
    payload,
    summary,
  };
};
