import { type Graph } from '@shared/core';
import type {
  TenantId,
  CommandRunbook,
  RecoverySignal,
  RecoverySimulationResult,
  OrchestrationPlan,
  WorkloadId,
} from '@domain/recovery-stress-lab';
import { createWorkloadId, createRunbookId, createSignalId } from '@domain/recovery-stress-lab';
import {
  buildConductorNamespace,
  buildRunId,
  ConductorPluginRegistry,
  buildPlugin,
  runConductorStream,
  type ConductorPluginDefinition,
  type ConductorPluginPhase,
  type ConductorPluginId,
  type ConductorPluginTag,
} from '@shared/recovery-orchestration-runtime';
import { resolveMetricKey } from '../types';

const createInputSignature = (tenantId: TenantId): string => `${tenantId}:${new Date().toISOString()}`;

type StageState = {
  readonly tenantId: TenantId;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly selectedSignals: readonly RecoverySignal[];
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
};

type StageInput = StageState;

type PluginConfig = {
  readonly workspace: TenantId;
  readonly phase: ConductorPluginPhase;
};

const createDependencyGraph = (runbooks: readonly CommandRunbook[]): Graph<WorkloadId, { fromCriticality: number; toCriticality: number }> => {
  const nodes = runbooks.map((runbook, index) => createWorkloadId(`${runbook.tenantId}::${runbook.id}::${index}`));
  const edges = nodes.flatMap((from, index) =>
    nodes.slice(index + 1).map((to, edgeOffset) => {
      const sourceStep = runbooks[index];
      const targetStep = runbooks[index + edgeOffset + 1];
      const fromCriticality = sourceStep ? Math.max(1, Math.min(5, (sourceStep.steps.length % 5) + 1)) : 1;
      const toCriticality = targetStep ? Math.max(1, Math.min(5, (targetStep.steps.length % 5) + 1)) : 1;
      return {
        from,
        to,
        weight: 1,
        payload: {
          fromCriticality,
          toCriticality,
        },
      };
    }),
  );

  return { nodes, edges };
};

const tags = <TPhase extends ConductorPluginPhase>(phase: TPhase): readonly ConductorPluginTag[] =>
  [phase as unknown as ConductorPluginTag];

const createStage = <TPhase extends ConductorPluginPhase>(
  namespace: ReturnType<typeof buildConductorNamespace>,
  phase: TPhase,
  dependencies: readonly ConductorPluginId[],
  phaseOrder: readonly ConductorPluginPhase[],
  config: PluginConfig,
  implementation: (input: StageInput) => Promise<StageState>,
) =>
  buildPlugin<ConductorPluginPhase, StageState, StageState, PluginConfig>(
  namespace,
  phase,
    {
      name: `${phase}-recovery`,
      runId: buildRunId(namespace, phaseOrder.length, `${config.workspace}-${phase}`),
      tags: tags(phase),
      dependencies,
      config,
      implementation: async (_, input) => {
        const output = await implementation(input);
        return {
          ok: true,
          payload: {
            ...output,
            selectedSignals: output.selectedSignals,
          },
          diagnostics: [`phase:${phase}`, resolveMetricKey(config.workspace, `${phase}/${config.phase}`)],
        };
      },
    },
  );

const normalizeSignals = (signals: readonly RecoverySignal[]) =>
  signals.map((signal) => ({
    id: createSignalId(signal.id),
    class: signal.class,
    severity: signal.severity,
    title: signal.title,
    createdAt: signal.createdAt,
    metadata: signal.metadata,
  }));

export const createConductorPluginCatalog = (
  tenantId: TenantId,
  runbooks: readonly CommandRunbook[],
  signals: readonly RecoverySignal[],
): readonly ConductorPluginDefinition<StageState, StageState, PluginConfig, ConductorPluginPhase>[] => {
  const namespace = buildConductorNamespace(`tenant:${tenantId}`);
  const dependencyGraph = createDependencyGraph(runbooks);
  const normalizedSignals = normalizeSignals(signals);
  const phaseOrder = ['discover', 'assess', 'simulate', 'actuate', 'verify', 'finalize'] as const;

  const discover = createStage(
    namespace,
    'discover',
    [],
    phaseOrder,
    { workspace: tenantId, phase: 'discover' },
    async () => ({
      tenantId,
      runbooks,
      signals: normalizedSignals,
      selectedSignals: normalizedSignals,
      plan: null,
      simulation: null,
    }),
  );

  const assess = createStage(
    namespace,
    'assess',
    [discover.id],
    phaseOrder,
    { workspace: tenantId, phase: 'assess' },
    async (input) => ({
      ...input,
      tenantId: tenantId,
      plan: null,
      simulation: null,
      selectedSignals: input.selectedSignals,
    }),
  );

  const simulate = createStage(
    namespace,
    'simulate',
    [assess.id],
    phaseOrder,
    { workspace: tenantId, phase: 'simulate' },
    async (input) => {
      return {
        ...input,
        plan: {
          tenantId,
          scenarioName: `${tenantId}::simulate`,
          schedule: [],
          runbooks: input.runbooks,
          dependencies: dependencyGraph,
          estimatedCompletionMinutes: 8,
        },
        simulation: null,
      };
    },
  );

  const actuate = createStage(
    namespace,
    'actuate',
    [simulate.id],
    phaseOrder,
    { workspace: tenantId, phase: 'actuate' },
    async (input) => ({
      ...input,
      simulation: {
        tenantId,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        selectedRunbooks: input.runbooks.map((entry) => entry.id),
        ticks: [],
        riskScore: 2,
        slaCompliance: 100,
        notes: ['actuated'],
      },
      selectedSignals: input.selectedSignals,
    }),
  );

  const verify = createStage(
    namespace,
    'verify',
    [actuate.id],
    phaseOrder,
    { workspace: tenantId, phase: 'verify' },
    async (input) => ({
      ...input,
      simulation: input.simulation
        ? {
            ...input.simulation,
            notes: [...input.simulation.notes, 'verified'],
          }
        : null,
      selectedSignals: input.selectedSignals,
    }),
  );

  const finalize = createStage(
    namespace,
    'finalize',
    [verify.id],
    phaseOrder,
    { workspace: tenantId, phase: 'finalize' },
    async (input) => ({
      ...input,
      simulation: input.simulation
        ? {
            ...input.simulation,
            notes: [...input.simulation.notes, 'finalized'],
          }
        : null,
      selectedSignals: input.selectedSignals,
    }),
  );

  return [discover, assess, simulate, actuate, verify, finalize];
};

export const executeConductorWorkflow = async (
  tenantId: TenantId,
  runbooks: readonly CommandRunbook[],
  signals: readonly RecoverySignal[],
): Promise<readonly string[]> => {
  const namespace = buildConductorNamespace(`tenant:${tenantId}`);
  const registry = ConductorPluginRegistry.create(createConductorPluginCatalog(tenantId, runbooks, signals));
  const summary: string[] = [];

  const initialState: StageState = {
    tenantId,
    runbooks,
    signals: normalizeSignals(signals),
    selectedSignals: signals,
    plan: null,
    simulation: null,
  };

  for await (const event of runConductorStream({
    tenantId,
    namespace,
    runIdSeed: createInputSignature(tenantId),
    registry,
    input: initialState,
    phaseOrder: ['discover', 'assess', 'simulate', 'actuate', 'verify', 'finalize'],
  })) {
    if (event.type === 'progress') {
      summary.push(event.diagnostics.join('|'));
      continue;
    }
    summary.push(`completed:${event.status}`);
  }

  return summary;
};
