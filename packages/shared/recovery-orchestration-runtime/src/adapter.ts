import { type Graph, type NodeId } from '@shared/core';
import { type NoInfer, type RecursivePath } from '@shared/type-level';
import {
  ConductorPluginPhase,
  ConductorPluginTag,
  type ConductorPluginDefinition,
  buildPlugin,
} from './plugins';
import { ConductorNamespace, buildConductorNamespace, buildRunId, type ConductorPluginId } from './ids';
import {
  type CommandRunbook,
  type RecoverySignal,
  type OrchestrationPlan,
  type RecoverySimulationResult,
  type WorkloadTarget,
  type TenantId,
  type SeverityBand,
  type SignalClass,
  createWorkloadId,
  createSignalId,
} from '@domain/recovery-stress-lab';

type StageInput = {
  readonly tenantId: TenantId;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly selectedSignals: readonly RecoverySignal[];
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
};

type StageConfig<TPhase extends ConductorPluginPhase> = {
  readonly phase: TPhase;
  readonly runbookCount: number;
  readonly signalCount: number;
};

type DependencyGraph = Graph<NodeId, { fromCriticality: number; toCriticality: number }>;

export type ConductorSignalPanel = {
  readonly tenantId: TenantId;
  readonly severity: SeverityBand;
  readonly labels: readonly string[];
};

export type ConductorRunSeed = {
  readonly tenantId: TenantId;
  readonly inputSignature: string;
  readonly targets: readonly WorkloadTarget[];
  readonly selectedSignals: readonly RecoverySignal[];
  readonly runbooks: readonly CommandRunbook[];
};

export type ConductorStageResult<TSignal extends string, TPayload> = {
  readonly tag: `${TSignal}:${string}`;
  readonly payload: TPayload;
};

const namespaceFor = (tenantId: TenantId): ConductorNamespace =>
  buildConductorNamespace(`tenant/${tenantId}`);

const createRunSignature = (tenantId: TenantId, runbooks: readonly CommandRunbook[]): string =>
  `${tenantId}:${runbooks.length}:${runbooks[0]?.id ?? 'empty-runbook'}`;

const createTag = <TPhase extends string>(phase: TPhase): ConductorPluginTag => `${phase}:plugin` as ConductorPluginTag;

const asReadonlySignals = (signals: readonly RecoverySignal[]) => signals;

  const mapSignalIds = (runbooks: readonly CommandRunbook[]) =>
    runbooks.flatMap((runbook) => runbook.steps.flatMap((step) => step.requiredSignals));

const buildDependencyGraph = (runbooks: readonly CommandRunbook[]): DependencyGraph => {
  const nodes = runbooks.map((runbook) => createWorkloadId(`${runbook.tenantId}::${runbook.id}`));
  const edges = nodes.flatMap((from, index) =>
    nodes.slice(index + 1).map((to, edgeOffset) => ({
      from,
      to,
      weight: 1,
      payload: {
        fromCriticality: 1 + ((edgeOffset + index) % 5),
        toCriticality: 1 + ((edgeOffset + 2) % 5),
      },
    })),
  );
  return { nodes, edges };
};

export const buildConductorSeedFromRunbooks = (
  tenantId: TenantId,
  runbooks: readonly CommandRunbook[],
): ConductorRunSeed => {
  const targets = runbooks.map((runbook, index) => ({
    tenantId,
    workloadId: createWorkloadId(`${tenantId}::${runbook.id}::${index}`),
    commandRunbookId: runbook.id,
    name: runbook.name,
    criticality: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    region: 'global',
    azAffinity: ['us-east-1', 'us-west-2'],
    baselineRtoMinutes: 30 + index * 5,
    dependencies: [],
  }));

  const selectedSignalIds = mapSignalIds(runbooks);
  const selectedSignals = selectedSignalIds.length > 0
    ? selectedSignalIds.map((id) => ({
        id: createSignalId(`${id}`),
        class: 'availability' as SignalClass,
        severity: 'critical' as const,
        title: `required:${id}`,
        createdAt: new Date().toISOString(),
        metadata: { origin: 'seed' },
      }))
    : [];

  return {
    tenantId,
    inputSignature: createRunSignature(tenantId, runbooks),
    targets,
    selectedSignals,
    runbooks,
  };
};

export const buildSignalPanel = <TSignal extends string>(
  tenantId: TenantId,
  severity: NoInfer<TSignal>,
  signals: readonly RecoverySignal[],
): readonly ConductorSignalPanel[] => {
  const byClass = new Map<TSignal, string[]>();
  for (const signal of signals) {
    const key = signal.class as TSignal;
    const current = byClass.get(key) ?? [];
    current.push(signal.id as string);
    byClass.set(key, current);
  }
  return Array.from(byClass.entries()).map(([key, ids]) => ({
    tenantId,
    severity: ids.length > 0 ? (severity as SeverityBand) : 'low',
    labels: ids,
  }));
};

export const mapPluginInput = <TInput extends Record<string, unknown>, TOutput>(
  input: TInput,
  mapper: (entry: TInput) => TOutput,
): TOutput => mapper(input);

type StagePluginConfig = StageConfig<ConductorPluginPhase>;

export const buildConductorStages = (
  tenantId: TenantId,
  runbooks: readonly CommandRunbook[],
  signals: readonly RecoverySignal[],
): readonly ConductorPluginDefinition<StageInput, StageInput, StagePluginConfig, ConductorPluginPhase>[] => {
  const namespace = namespaceFor(tenantId);
  const dependencyGraph = buildDependencyGraph(runbooks);
  const requiredSignalIds = new Set<string>(mapSignalIds(runbooks));
  const requiredSignals = signals.filter((signal) => requiredSignalIds.has(signal.id as string));
  const selectedSignals = requiredSignals.length > 0 ? requiredSignals : signals;
  const seedState: StageInput = {
    tenantId,
    runbooks,
    signals: asReadonlySignals(signals),
    selectedSignals,
    plan: null,
    simulation: null,
  };

  const phaseOrder = ['discover', 'assess', 'simulate', 'actuate', 'verify', 'finalize'] as const;

  const createPlugin = <TPhase extends ConductorPluginPhase>(
    phase: TPhase,
    dependencies: readonly ConductorPluginId[],
    config: StageConfig<TPhase>,
    run: (seed: StageInput) => Promise<StageInput>,
  ): ConductorPluginDefinition<StageInput, StageInput, any, ConductorPluginPhase> => {
    const dependencyIds = [...dependencies];
    return buildPlugin<TPhase, StageInput, StageInput, StageConfig<TPhase>>(namespace, phase, {
      name: `${tenantId}:${phase}:runtime`,
      runId: buildRunId(namespace, phaseOrder.indexOf(phase) + 1, `${tenantId}:${phase}`),
      tags: [createTag(phase)],
      dependencies: dependencyIds,
      config,
      implementation: async (_, state) => {
        const payload = await run(state);
        return {
          ok: true,
          payload,
          diagnostics: [
            `${phase}`,
            `${tenantId}`,
            `runbooks:${payload.runbooks.length}`,
          ],
        };
      },
    });
  };

  const toDiagnostics = (phase: string, panel: readonly ConductorSignalPanel[]) =>
    panel.map((entry) => `${phase}:${entry.severity}:${entry.labels.length}`).join(' ');

  const discoverPlugin = createPlugin(
    'discover',
    [],
    {
      phase: 'discover',
      runbookCount: runbooks.length,
      signalCount: signals.length,
    },
    async (state) => ({
      ...seedState,
      selectedSignals,
    }),
  );

  const assessPlugin = createPlugin(
    'assess',
    [discoverPlugin.id],
    {
      phase: 'assess',
      runbookCount: runbooks.length,
      signalCount: signals.length,
    },
    async (state) => {
      const panel = buildSignalPanel(tenantId, 'critical', state.signals);
      return {
        ...state,
        selectedSignals: panel.flatMap((entry) =>
          entry.labels.map((label) => ({
            id: createSignalId(label),
            class: 'availability' as SignalClass,
            severity: entry.severity,
            title: label,
            createdAt: new Date().toISOString(),
            metadata: { phase: 'assess' },
          })),
        ),
        plan: null,
        simulation: null,
      };
    },
  );

  const simulatePlugin = createPlugin(
    'simulate',
    [assessPlugin.id],
    {
      phase: 'simulate',
      runbookCount: runbooks.length,
      signalCount: signals.length,
    },
    async (state) => {
      const panel = buildSignalPanel(tenantId, 'high', state.selectedSignals);
      return {
        ...state,
        plan: {
          tenantId,
          scenarioName: `${tenantId}:simulate:${toDiagnostics('simulate', panel)}`,
          schedule: [],
          runbooks: state.runbooks,
          dependencies: dependencyGraph,
          estimatedCompletionMinutes: 12 + panel.length,
        },
        simulation: null,
      };
    },
  );

  const actuatePlugin = createPlugin(
    'actuate',
    [simulatePlugin.id],
    {
      phase: 'actuate',
      runbookCount: runbooks.length,
      signalCount: signals.length,
    },
    async (state) => ({
      ...state,
      simulation: {
        tenantId,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        selectedRunbooks: state.runbooks.map((entry) => entry.id),
        ticks: [],
        riskScore: 1,
        slaCompliance: 100,
        notes: ['actuated'],
      },
      plan: state.plan,
    }),
  );

  const verifyPlugin = createPlugin(
    'verify',
    [actuatePlugin.id],
    {
      phase: 'verify',
      runbookCount: runbooks.length,
      signalCount: signals.length,
    },
    async (state) => ({
      ...state,
      simulation: state.simulation
        ? {
            ...state.simulation,
            notes: [...state.simulation.notes, 'verified'],
          }
        : null,
    }),
  );

  const finalizePlugin = createPlugin(
    'finalize',
    [verifyPlugin.id],
    {
      phase: 'finalize',
      runbookCount: runbooks.length,
      signalCount: signals.length,
    },
    async (state) => ({
      ...state,
      simulation: state.simulation
        ? {
            ...state.simulation,
            slaCompliance: 99,
            notes: [...state.simulation.notes, 'finalized'],
          }
        : null,
    }),
  );

  return [discoverPlugin, assessPlugin, simulatePlugin, actuatePlugin, verifyPlugin, finalizePlugin];
};

export const collectPluginPathMap = (
  plugins: readonly ConductorPluginDefinition[],
): Readonly<Record<string, ConductorPluginPhase>> => {
  const output = {} as Record<string, ConductorPluginPhase>;
  for (const plugin of plugins) {
    output[plugin.id] = plugin.phase;
  }
  return output;
};

export const toRecursivePaths = <T extends object>(value: T): readonly RecursivePath<T>[] => {
  return Object.keys(value).map((key) => key as RecursivePath<T>) as readonly RecursivePath<T>[];
};
