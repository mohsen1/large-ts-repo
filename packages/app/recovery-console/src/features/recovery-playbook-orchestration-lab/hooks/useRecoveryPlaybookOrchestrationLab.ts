import { useCallback, useMemo, useState } from 'react';
import { runPlaybookOrchestration, createOrchestrator, readWorkspaceSummary } from '@service/recovery-playbook-orchestrator';
import type {
  DriftSignal,
  RecoveryPlaybookModel,
} from '@domain/recovery-playbook-orchestration';

interface Props {
  workspaceId: string;
  tenantId: string;
  tenantContext: { tenantId: string; region: string; environment: 'prod' | 'staging' | 'sandbox' };
}

interface SimulationState {
  readonly loading: boolean;
  readonly error: string | null;
  readonly plan: ReturnType<typeof createOrchestrator> | null;
  readonly lastSignalCount: number;
  readonly status: string;
}

const basePlaybook = (tenantId: string, workspaceId: string): RecoveryPlaybookModel => ({
  id: `seed-${tenantId}-${workspaceId}-playbook` as RecoveryPlaybookModel['id'],
  title: 'Recovery playbook simulation',
  tenant: tenantId,
  createdAt: new Date().toISOString(),
  scenarioGraph: {
    nodes: {
      'scenario-1': {
        id: 'scenario-1',
        name: 'Detect and isolate',
        dependencies: [],
        expectedDurationMinutes: 5,
        riskImpact: 0.2,
        signals: [],
        policyBindings: ['policy-detection'],
      },
      'scenario-2': {
        id: 'scenario-2',
        name: 'Contain and reroute',
        dependencies: ['scenario-1'],
        expectedDurationMinutes: 8,
        riskImpact: 0.4,
        signals: [],
        policyBindings: ['policy-contain'],
      },
    },
    order: ['scenario-1', 'scenario-2'],
    metadata: {
      estimatedDurationMinutes: 13,
      blastRadius: 'amber',
    },
  },
  policies: {
    'policy-detection': {
      id: 'policy-detection',
      name: 'Detection policy',
      owner: 'platform',
      description: 'Allow automated runbook detection stage',
      requiredPolicies: [],
      forbiddenPolicies: [],
    },
    'policy-contain': {
      id: 'policy-contain',
      name: 'Containment policy',
      owner: 'platform',
      description: 'Allow containment stage execution',
      requiredPolicies: ['policy-detection'],
      forbiddenPolicies: [],
    },
  },
  priorities: ['scenario-1', 'scenario-2'],
  confidence: 0.97,
});

const makeSignals = (seed: string): DriftSignal[] => {
  return [
    {
      id: `${seed}-signal-1`,
      signal: 'latency-spike',
      severity: 'medium',
      tags: ['runtime', 'latency'],
      confidence: 0.84,
      capturedAt: new Date().toISOString(),
      evidence: [
        {
          id: 'e1',
          kind: 'telemetry',
          summary: 'P95 rose above threshold for 5m',
          payload: { value: 1200, threshold: 1000 },
        },
      ],
    },
    {
      id: `${seed}-signal-2`,
      signal: 'error-budget-degradation',
      severity: 'high',
      tags: ['slo', 'quality'],
      confidence: 0.71,
      capturedAt: new Date().toISOString(),
      evidence: [
        {
          id: 'e2',
          kind: 'slo',
          summary: 'Error budget burn rate exceeded 2x',
          payload: { burnRate: 2.4 },
        },
      ],
    },
    {
      id: `${seed}-signal-3`,
      signal: 'resource-cascade',
      severity: 'low',
      tags: ['capacity', 'resources'],
      confidence: 0.42,
      capturedAt: new Date().toISOString(),
      evidence: [
        {
          id: 'e3',
          kind: 'agent',
          summary: 'Capacity manager flagged soft threshold',
          payload: { maxQueue: 85, targetQueue: 80 },
        },
      ],
    },
  ];
};

export const useRecoveryPlaybookOrchestrationLab = ({ workspaceId, tenantId, tenantContext }: Props) => {
  const [state, setState] = useState<SimulationState>({
    loading: false,
    error: null,
    plan: null,
    lastSignalCount: 0,
    status: 'idle',
  });

  const playbook = useMemo(() => basePlaybook(tenantId, workspaceId), [tenantId, workspaceId]);

  const runtime = useMemo(
    () => createOrchestrator(tenantId, workspaceId, tenantContext, { planningMode: 'canary', enforcePolicy: true }),
    [tenantId, workspaceId, tenantContext],
  );

  const run = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: null, status: 'running' }));

    const signals = makeSignals(playbook.id);
    const result = await runPlaybookOrchestration(
      {
        workspaceId,
        tenant: tenantContext,
        playbook,
        signals,
        policies: Object.values(playbook.policies),
        options: {
          planningMode: runtime.options.planningMode,
          enforcePolicy: runtime.options.enforcePolicy,
          parallelismLimit: 8,
        },
      },
      playbook,
    );

    if (!result.ok) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error: String(result.error),
        status: 'failed',
      }));
      return;
    }

    setState((previous) => ({
      ...previous,
      loading: false,
      plan: runtime,
      lastSignalCount: signals.length,
      status: result.value.outcome.success ? 'succeeded' : 'warning',
    }));
  }, [runtime, tenantContext, tenantId, workspaceId, playbook]);

  const refreshSummary = useCallback(async () => {
    const summary = await readWorkspaceSummary(tenantId, workspaceId);
    setState((previous) => ({
      ...previous,
      status: summary.health.length === 0 ? 'idle' : `ready:${summary.latestOutcome?.finalBand ?? 'unknown'}`,
    }));
  }, [tenantId, workspaceId]);

  return {
    status: state.status,
    loading: state.loading,
    error: state.error,
    plan: state.plan,
    lastSignalCount: state.lastSignalCount,
    run,
    refreshSummary,
    playbook,
  };
};
