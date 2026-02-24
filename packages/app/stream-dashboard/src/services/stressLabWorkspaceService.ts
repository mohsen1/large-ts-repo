import { useMemo } from 'react';
import {
  createStudioOrchestrator,
  type StudioOrchestratorInput,
  type StudioOrchestratorResult,
  type StudioRuntimeInput,
} from '@service/recovery-stress-lab-orchestrator';
import {
  CommandRunbook,
  RecoverySignal,
  RecoverySimulationResult,
  OrchestrationPlan,
  TenantId,
  WorkloadTarget,
  createTenantId,
  createWorkloadId,
  createRunbookId,
} from '@domain/recovery-stress-lab';
import {
  type PluginContext,
  type PluginDefinition,
  type PluginKind,
  PluginRegistry,
  type PluginResult,
  buildPluginDefinition,
  buildPluginVersion,
  canonicalizeNamespace,
  createPluginId,
  type PluginSessionConfig,
  withAsyncPluginScope,
} from '@shared/stress-lab-runtime';

export type StressLabTenant = TenantId;

export interface StressLabWorkspace {
  readonly tenantId: StressLabTenant;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
}

export interface StressLabTopology {
  readonly tenantId: StressLabTenant;
  readonly targets: readonly string[];
  readonly riskBand: 'low' | 'medium' | 'high' | 'critical';
}

export interface StressLabControlRecord {
  readonly runId: string;
  readonly stage: string;
  readonly status: 'ok' | 'warn' | 'error';
  readonly message: string;
  readonly producedAt: string;
}

export interface StressLabControlResult {
  readonly tenantId: TenantId;
  readonly orchestration: StudioOrchestratorResult;
  readonly workspace: {
    readonly plan: OrchestrationPlan | null;
    readonly simulation: RecoverySimulationResult | null;
    readonly stage: string;
    readonly confidence: number;
  };
  readonly events: readonly StressLabControlRecord[];
}

export interface StressLabSignalDigest {
  readonly total: number;
  readonly classes: Readonly<Record<RecoverySignal['class'], number>>;
  readonly severityTop: RecoverySignal['severity'];
}

export interface StressLabRegistryPlugin {
  readonly id: string;
  readonly name: string;
  readonly kind: PluginKind;
  readonly stage: string;
  readonly isEnabled: boolean;
}

const orchestrator = createStudioOrchestrator();
const namespace = canonicalizeNamespace('recovery:stress:lab');

export const toSignalDigest = (signals: readonly RecoverySignal[]): StressLabSignalDigest => {
  const classes = new Map<RecoverySignal['class'], number>([
    ['availability', 0],
    ['integrity', 0],
    ['performance', 0],
    ['compliance', 0],
  ]);

  for (const signal of signals) {
    classes.set(signal.class, (classes.get(signal.class) ?? 0) + 1);
  }

  const sortedBySeverity = [...signals].sort((left, right) => {
    const weight = (value: RecoverySignal['severity']) =>
      value === 'critical' ? 4 : value === 'high' ? 3 : value === 'medium' ? 2 : 1;
    return weight(right.severity) - weight(left.severity);
  });

  return {
    total: signals.length,
    classes: {
      availability: classes.get('availability') ?? 0,
      integrity: classes.get('integrity') ?? 0,
      performance: classes.get('performance') ?? 0,
      compliance: classes.get('compliance') ?? 0,
    },
    severityTop: sortedBySeverity[0]?.severity ?? 'low',
  };
};

const asTenant = (tenantId: string): TenantId => createTenantId(tenantId);

const defaultTopology = (tenantId: TenantId): StressLabTopology => ({
  tenantId,
  targets: ['frontend', 'api', 'database', 'cache'],
  riskBand: 'medium',
});

const estimateCriticality = (severity: RecoverySignal['severity']): WorkloadTarget['criticality'] => {
  switch (severity) {
    case 'critical':
      return 5;
    case 'high':
      return 4;
    case 'medium':
      return 3;
    default:
      return 2;
  }
};

const toTopology = (tenantId: TenantId, signals: readonly RecoverySignal[]): readonly WorkloadTarget[] => {
  return signals.map((signal, index) => ({
    tenantId,
    workloadId: createWorkloadId(`${tenantId}-${signal.id}-${index}`),
    commandRunbookId: createRunbookId(`derived-${String(signal.id)}-${index}`),
    name: signal.title,
    criticality: estimateCriticality(signal.severity),
    region: 'global',
    azAffinity: ['zone-a'],
    baselineRtoMinutes: 10,
    dependencies: index > 0 ? [createWorkloadId(`${tenantId}-${signals[index - 1]?.id ?? index - 1}`)] : [],
  }));
};

const toStudioInput = (tenantId: TenantId, workspace: StressLabWorkspace): StudioRuntimeInput => {
  return {
    tenantId,
    signals: workspace.signals,
    topology: toTopology(tenantId, workspace.signals),
    runbooks: workspace.runbooks,
  };
};

const parseOrchestratorEvents = (
  orchestratorResult: StudioOrchestratorResult,
  runId: string,
): readonly StressLabControlRecord[] => {
  const stages = ['input', 'shape', 'plan', 'simulate', 'recommend', 'report'];
  return orchestratorResult.events.slice(0, 12).map((message, index) => {
    const status: StressLabControlRecord['status'] = message.includes('warn')
      ? 'warn'
      : message.includes('error')
        ? 'error'
        : 'ok';

    return {
      runId,
      stage: stages[index % stages.length],
      status,
      message,
      producedAt: new Date(Date.now() + index * 400).toISOString(),
    };
  });
};

const bootstrapPlugins = (tenantId: TenantId): readonly StressLabRegistryPlugin[] => {
  const kinds: PluginKind[] = [
    'stress-lab/input-validator',
    'stress-lab/topology-builder',
    'stress-lab/signal-sanitizer',
    'stress-lab/runbook-optimizer',
    'stress-lab/simulator',
    'stress-lab/reporter',
  ];

  return kinds.map((kind, index) => ({
    id: String(createPluginId(namespace, kind, `${tenantId}-${kind}`)),
    name: `${kind}-for-${tenantId}`,
    kind,
    stage: kind.includes('input')
      ? 'input'
      : kind.includes('topology') || kind.includes('sanitizer')
        ? 'shape'
        : kind.includes('runbook')
          ? 'plan'
          : kind.includes('simulator')
            ? 'simulate'
            : 'recommend',
    isEnabled: index % 2 === 0 || kind.includes('reporter'),
  }));
};

const collectEnabledPlugins = (plugins: readonly StressLabRegistryPlugin[]) =>
  plugins.filter((plugin) => plugin.isEnabled);

const pluginFor = (
  tenantId: TenantId,
  stage: string,
): PluginDefinition<StudioOrchestratorInput, RecoverySimulationResult | null, { tenantId: TenantId; scope: string; stage: string }> => {
  return buildPluginDefinition(namespace, 'stress-lab/runtime', {
    name: `plugin-${tenantId}-${stage}`,
    version: buildPluginVersion(1, 0, 0),
    tags: [String(tenantId), stage],
    dependencies: ['dep:recovery:stress:lab'],
    pluginConfig: { tenantId, scope: `tenant:${tenantId}`, stage },
    run: async (
      _context: PluginContext<{ tenantId: TenantId; scope: string; stage: string }>,
      _payload: StudioOrchestratorInput,
    ): Promise<PluginResult<RecoverySimulationResult | null>> => ({
      ok: true,
      value: null,
      generatedAt: new Date().toISOString(),
    }),
  });
};

const pluginRegistry = async (tenantId: TenantId): Promise<PluginRegistry> => {
  const registry = PluginRegistry.create(namespace);
  for (const plugin of collectEnabledPlugins(bootstrapPlugins(tenantId))) {
    registry.register(pluginFor(tenantId, plugin.stage));
  }
  return registry;
};

export const summarizeWorkspace = (
  tenantId: string,
  workspace: { readonly runbooks: readonly CommandRunbook[]; readonly signals: readonly RecoverySignal[] },
) => {
  const tenant = asTenant(tenantId);
  const digest = toSignalDigest(workspace.signals);
  const topology = defaultTopology(tenant);

  return {
    tenantId: tenant,
    digest,
    topology,
    signalClasses: digest.classes,
    topSignal: workspace.signals.slice(0, 3).map((signal) => signal.id),
    runbookCount: workspace.runbooks.length,
  };
};

export const runStressLabControl = async (
  tenantId: string,
  workspace: StressLabWorkspace,
): Promise<StressLabControlResult> => {
  const normalizedTenant = asTenant(tenantId);
  const runInput = toStudioInput(normalizedTenant, workspace);
  const runId = `ws-${normalizedTenant}-${Date.now()}`;

  const sessionConfig: PluginSessionConfig = {
    tenantId: normalizedTenant,
    namespace,
    requestId: runId,
    startedAt: new Date().toISOString(),
  };

  const pluginList = await pluginRegistry(normalizedTenant);

  return withAsyncPluginScope(sessionConfig, async () => {
    const orchestration = await orchestrator.run(runInput);
    const events = parseOrchestratorEvents(orchestration, runId);
    const pluginEvents = pluginList.list().map((entry) => String(entry.id));
    const pluginRecords: readonly StressLabControlRecord[] = pluginEvents.slice(0, 6).map((pluginId, index) => ({
      runId,
      stage: 'plugin-register',
      status: 'ok',
      message: `register:${pluginId}`,
      producedAt: new Date(Date.now() + index * 200).toISOString(),
    }));

    return {
      tenantId: normalizedTenant,
      orchestration: {
        ...orchestration,
        events: [...orchestration.events, ...pluginEvents],
      },
      workspace: {
        plan: orchestration.snapshot.plan,
        simulation: orchestration.snapshot.simulation,
        stage: orchestration.snapshot.stage,
        confidence: orchestration.snapshot.simulation
          ? orchestration.snapshot.simulation.riskScore
          : 0,
      },
      events: [...events, ...pluginRecords],
    };
  });
};

export const useWorkspaceSummary = (tenantId: string, workspace: StressLabWorkspace): { readonly summary: ReturnType<typeof summarizeWorkspace>; readonly runLabel: string } => {
  const summary = summarizeWorkspace(tenantId, workspace);
  const pluginCount = useMemo(() => bootstrapPlugins(asTenant(tenantId)).length, [tenantId]);
  const runLabel = `${tenantId}:${summary.topSignal.length}:${pluginCount}`;
  return { summary, runLabel };
};
