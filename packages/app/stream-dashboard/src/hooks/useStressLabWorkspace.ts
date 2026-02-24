import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  auditWorkspace,
  compileWorkspace,
  CommandRunbook,
  CommandStep,
  createRunbookId,
  createStepId,
  createSignalId,
  createTenantId,
  createWorkloadId,
  OrchestrationPlan,
  prioritizeFindings,
  RecoverySignal,
  summarizeAudit,
  WorkloadTarget,
} from '@domain/recovery-stress-lab';
import {
  runStressLabControl,
  summarizeWorkspace,
  type StressLabControlResult,
  type StressLabWorkspace,
} from '../services/stressLabWorkspaceService';
import { StreamStressLabWorkspace } from '../types/stressLab';

interface StressLabSeedSignal {
  readonly id: string;
  readonly class: RecoverySignal['class'];
  readonly severity: RecoverySignal['severity'];
  readonly title: string;
  readonly createdAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

interface StressLabSeedRunbook {
  readonly id: string;
  readonly title?: string;
  readonly name?: string;
  readonly description?: string;
  readonly steps: readonly StressLabSeedRunbookStep[];
  readonly cadence: {
    readonly weekday: number;
    readonly windowStartMinute: number;
    readonly windowEndMinute: number;
  };
  readonly ownerTeam?: string;
}

interface StressLabSeedRunbookStep {
  readonly commandId: string;
  readonly title: string;
  readonly phase: CommandStep['phase'];
  readonly estimatedMinutes: number;
  readonly prerequisites: readonly string[];
  readonly requiredSignals: readonly string[];
}

interface LedgerRecord {
  readonly id: string;
  readonly class: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly title: string;
  readonly createdAt: string;
  readonly metadata: Record<string, unknown>;
}

interface UseStressLabWorkspaceOptions {
  readonly tenantId: string;
  readonly initialRunbooks?: number;
  readonly streamId?: string;
  readonly runbooks?: readonly StressLabSeedRunbook[];
  readonly signals?: readonly RecoverySignal[];
}

interface StressLabWorkspaceState {
  readonly loading: boolean;
  readonly control: StressLabControlResult | null;
  readonly error: string | null;
  readonly summary: ReturnType<typeof summarizeWorkspace> | null;
  readonly workspace: StreamStressLabWorkspace;
  readonly lastUpdatedAt: string | null;
  readonly signalCount: number;
  readonly runbookCount: number;
  readonly digestTopSignal: ReturnType<typeof summarizeWorkspace>['topSignal'];
}

const buildDefaultRunbook = (tenantId: string, index: number): CommandRunbook => {
  const runbookId = createRunbookId(`${tenantId}-${index}`);
  return {
    id: runbookId,
    tenantId: createTenantId(tenantId),
    name: `runbook-${index + 1}`,
    description: `Synthetic runbook ${index + 1}`,
    steps: [
      {
        commandId: createStepId(`${runbookId}-command-1`),
        title: 'Observe',
        phase: 'observe',
        estimatedMinutes: 6 + index,
        prerequisites: [],
        requiredSignals: [],
      },
      {
        commandId: createStepId(`${runbookId}-command-2`),
        title: 'Restore',
        phase: 'restore',
        estimatedMinutes: 12,
        prerequisites: [createStepId(`${runbookId}-command-1`)],
        requiredSignals: [],
      },
    ],
    ownerTeam: 'recovery-core',
    cadence: {
      weekday: index % 7,
      windowStartMinute: 90 + index * 15,
      windowEndMinute: 150 + index * 15,
    },
  };
};

const normalizeSeedSignals = (tenantId: string, rawSignals: readonly StressLabSeedSignal[]): readonly RecoverySignal[] => {
  return rawSignals.map((signal, index) => ({
    id: createSignalId(signal.id),
    class: signal.class,
    severity: signal.severity,
    title: signal.title,
    createdAt: signal.createdAt,
    metadata: {
      ...signal.metadata,
      seedIndex: index,
      tenant: tenantId,
    },
  }));
};

const normalizeRunbook = (tenantId: string, raw: StressLabSeedRunbook): CommandRunbook => {
  const tenant = createTenantId(tenantId);
  const runbookId = createRunbookId(`${tenantId}-${raw.id}`);
  return {
    id: runbookId,
    tenantId: tenant,
    name: raw.name ?? raw.title ?? `runbook-${raw.id}`,
    description: raw.description ?? `Runbook ${raw.id}`,
    steps: raw.steps.map((step, stepIndex) => ({
      commandId: createStepId(`${tenantId}-${raw.id}-${stepIndex}-${step.commandId}`),
      title: step.title,
      phase: step.phase,
      estimatedMinutes: step.estimatedMinutes,
      prerequisites: step.prerequisites.map((entry) => createStepId(`${tenantId}-${entry}`)),
      requiredSignals: step.requiredSignals.map((entry) => createSignalId(`${tenantId}-${entry}`)),
    })),
    ownerTeam: raw.ownerTeam ?? 'platform',
    cadence: raw.cadence,
  };
};

const buildWorkspaceTargets = (tenantId: string, runbooks: readonly CommandRunbook[], signals: readonly RecoverySignal[]): readonly WorkloadTarget[] => {
  return signals.map((signal, index) => ({
    tenantId: createTenantId(tenantId),
    workloadId: createWorkloadId(`${tenantId}:${index}:${signal.id}`),
    commandRunbookId: runbooks[index]?.id ?? createRunbookId(`runbook-${tenantId}-${index}`),
    name: signal.title,
    criticality: signal.severity === 'critical' ? 5 : signal.severity === 'high' ? 4 : signal.severity === 'medium' ? 3 : 2,
    region: 'global',
    azAffinity: ['a', 'b'],
    baselineRtoMinutes: 15 + index,
    dependencies: index > 0 ? [createWorkloadId(`${tenantId}:${index - 1}:${signals[index - 1]?.id ?? index}`)] : [],
  }));
};

const seedSignals = (tenantId: string): readonly RecoverySignal[] =>
  normalizeSeedSignals(tenantId, [
    {
      id: `${tenantId}:availability`,
      class: 'availability',
      severity: 'high',
      title: 'High availability risk',
      createdAt: new Date(Date.now() - 10_000).toISOString(),
      metadata: { seed: 'default', origin: 'hooks' },
    },
    {
      id: `${tenantId}:performance`,
      class: 'performance',
      severity: 'medium',
      title: 'Latency increase',
      createdAt: new Date(Date.now() - 8_000).toISOString(),
      metadata: { seed: 'default', origin: 'hooks' },
    },
    {
      id: `${tenantId}:integrity`,
      class: 'integrity',
      severity: 'low',
      title: 'Integrity drift',
      createdAt: new Date(Date.now() - 5_000).toISOString(),
      metadata: { seed: 'default', origin: 'hooks' },
    },
  ]);

const mapWorkspaceFromDomain = (tenantId: string, runbooks: readonly CommandRunbook[], signals: readonly RecoverySignal[]): StreamStressLabWorkspace => {
  const targets = buildWorkspaceTargets(tenantId, runbooks, signals);
  const fused = compileWorkspace({
    tenantId: createTenantId(tenantId),
    targets,
    signals,
    selectedRunbooks: runbooks,
    profileHint: 'normal',
  });

  return {
    tenantId: createTenantId(tenantId),
    plan: fused.plan,
    simulation: fused.simulation,
    runbooks: fused.runbooks,
    runbookSignals: fused.selectedSignals,
    targets,
    configBand: fused.state.selectedBand,
    state: fused.state,
  };
};

const seedFromSignals = (tenantId: string, count: number): readonly LedgerRecord[] =>
  [
    {
      id: `${tenantId}:boot-1`,
      class: 'availability',
      severity: 'medium',
      title: `seed signals=${count}`,
      createdAt: new Date().toISOString(),
      metadata: {
        seed: true,
        signalCount: count,
      },
    },
  ];

export const useStressLabWorkspace = ({ tenantId, initialRunbooks = 2, runbooks: seedRunbooks, signals: seedSignalsInput }: UseStressLabWorkspaceOptions) => {
  const tenant = createTenantId(tenantId);

  const [runbooks, setRunbooks] = useState<readonly CommandRunbook[]>(() => {
    if (seedRunbooks && seedRunbooks.length > 0) {
      return seedRunbooks.map((runbook) => normalizeRunbook(tenantId, runbook));
    }
    return Array.from({ length: initialRunbooks }, (_value, index) => buildDefaultRunbook(tenantId, index));
  });

  const [signals, setSignals] = useState<readonly RecoverySignal[]>(() => {
    if (seedSignalsInput && seedSignalsInput.length > 0) {
      return seedSignalsInput;
    }
    return seedSignals(tenantId);
  });

  const [events, setEvents] = useState<readonly LedgerRecord[]>(() => seedFromSignals(tenantId, 3));
  const [control, setControl] = useState<StressLabControlResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [findings, setFindings] = useState<readonly string[]>([]);
  const [lastReport, setLastReport] = useState('No audits run yet');

  const workspace = useMemo<StreamStressLabWorkspace>(() => mapWorkspaceFromDomain(tenantId, runbooks, signals), [tenantId, runbooks, signals]);
  const summary = useMemo(() => summarizeWorkspace(tenantId, { runbooks, signals }), [tenantId, runbooks, signals]);
  const previousPlanRef = useRef<OrchestrationPlan | null>(null);

  useEffect(() => {
    const report = auditWorkspace(tenant, workspace.plan, workspace.simulation, workspace.runbooks, workspace.runbookSignals, previousPlanRef.current);
    const sortedFindings = prioritizeFindings(report.findings);

    previousPlanRef.current = workspace.plan;
    setFindings(sortedFindings.map((finding) => `${finding.code}:${finding.title}:${finding.details}`));
    setLastReport(summarizeAudit(report));
  }, [tenant, workspace]);

  useEffect(() => {
    const ticker = setInterval(() => {
      setEvents((current) => {
        const heartbeat: LedgerRecord = {
          id: `stress-event-${tenantId}-${Date.now()}`,
          class: 'performance',
          severity: 'low',
          title: 'control heartbeat',
          createdAt: new Date().toISOString(),
          metadata: {
            tenant: tenantId,
            activeSignals: signals.length,
          },
        };

        return [heartbeat, ...current].slice(0, 12);
      });
    }, 9_000);

    return () => clearInterval(ticker);
  }, [tenantId, signals.length]);

  const state: StressLabWorkspaceState = {
    loading,
    control,
    error,
    summary,
    workspace,
    lastUpdatedAt,
    signalCount: signals.length,
    runbookCount: runbooks.length,
    digestTopSignal: summary.topSignal,
  };

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);

    const workspacePayload: StressLabWorkspace = {
      tenantId: tenant,
      runbooks,
      signals,
    };

    try {
      const result = await runStressLabControl(tenantId, workspacePayload);
      setControl(result);
      setLastUpdatedAt(new Date().toISOString());
    } catch (next) {
      setError(next instanceof Error ? next.message : String(next));
    } finally {
      setLoading(false);
    }
  }, [runbooks, signals, tenant, tenantId]);

  const appendRunbook = useCallback(() => {
    setRunbooks((current) => {
      const next = buildDefaultRunbook(tenantId, current.length + 1);
      return [...current, next];
    });
  }, [tenantId]);

  const removeRunbook = useCallback((runbookId: string) => {
    setRunbooks((current) => current.filter((runbook) => runbook.id !== runbookId));
  }, []);

  const enrichSignals = useCallback(() => {
    setSignals((current) => {
      const next = createSignalId(`${tenantId}:${current.length + 1}`);
      return [
        {
          id: next,
          class: 'compliance',
          severity: current.length % 2 === 0 ? 'critical' : 'medium',
          title: `Injected ${current.length + 1}`,
          createdAt: new Date().toISOString(),
          metadata: {
            source: 'ui',
            generatedBy: 'useStressLabWorkspace.enrichSignals',
          },
        },
        ...current,
      ];
    });
  }, [tenantId]);

  const bootstrap = useCallback(async () => {
    await run();
  }, [run]);

  const refresh = useCallback(() => {
    void run();
  }, [run]);

  return {
    workspace,
    state,
    events,
    findings,
    lastReport,
    run,
    bootstrap,
    refresh,
    appendRunbook,
    removeRunbook,
    enrichSignals,
  };
};
