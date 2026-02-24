import {
  PluginDefinition,
  PluginRegistry,
  PluginResult,
  type PluginId,
  type PluginKind,
  type PluginTag,
  type PluginContext,
} from '@shared/stress-lab-runtime';
import {
  CommandRunbook,
  OrchestrationPlan,
  ReadinessWindow,
  RecoverySimulationResult,
  RecoverySignal,
  severityRank,
  createTenantId,
  createRunbookId,
  StressRunState,
  TenantId,
  WorkloadTarget,
} from './models';
import { buildStudioCatalog, type StudioPluginId } from './stress-studio-registry';

export type StudioPhase = 'seed' | 'normalize' | 'compose' | 'simulate' | 'audit' | 'finalize';
export type WorkflowNodeKind = `node:${StudioPhase}`;

export type RecursiveTuple<T extends unknown[], N extends number> =
  N extends 0 ? [] : T extends readonly [infer H, ...infer R] ? [H, ...RecursiveTuple<R, N>] : [];

export interface WorkflowNode<TInput = unknown, TOutput = unknown> {
  readonly id: `node-${string}`;
  readonly title: string;
  readonly phase: StudioPhase;
  readonly inputType: string;
  readonly outputType: string;
  readonly dependencies: readonly string[];
  readonly execute:
    | ((input: TInput) => PluginResult<TOutput>)
    | ((input: TInput) => Promise<PluginResult<TOutput>>);
}

export interface WorkflowExecutionProfile {
  readonly tenantId: TenantId;
  readonly traceId: string;
  readonly phaseCoverage: Readonly<Record<StudioPhase, number>>;
  readonly pluginKinds: readonly PluginKind[];
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface StudioWorkflow {
  readonly id: `workflow-${string}`;
  readonly tenantId: TenantId;
  readonly nodes: readonly WorkflowNode[];
  readonly signals: readonly RecoverySignal[];
  readonly windows: readonly ReadinessWindow[];
  readonly targets: readonly WorkloadTarget[];
  readonly runbooks: readonly CommandRunbook[];
  readonly startedAt: string;
  readonly updatedAt: string;
}

export interface StudioPipelineOutput {
  readonly profile: WorkflowExecutionProfile;
  readonly plan: OrchestrationPlan;
  readonly simulation: RecoverySimulationResult;
  readonly auditTags: readonly string[];
}

const normalizePhase = (value: string): StudioPhase => {
  if (value === 'seed' || value === 'normalize' || value === 'compose' || value === 'simulate' || value === 'audit' || value === 'finalize') {
    return value;
  }
  return 'normalize';
};

const buildNodeId = (phase: StudioPhase, index: number): `node-${string}` => `node-${phase}-${index}` as const;

const collectPhaseWindows = (windows: readonly ReadinessWindow[]): Record<StudioPhase, number> => {
  const base: Record<StudioPhase, number> = {
    seed: 0,
    normalize: 0,
    compose: 0,
    simulate: 0,
    audit: 0,
    finalize: 0,
  };

  for (const window of windows) {
    const [firstPhase = 'seed'] = window.phaseOrder;
    const phase = normalizePhase(firstPhase);
    base[phase] += window.phaseOrder.length;
  }

  return base;
};

const planFromSignals = (tenantId: TenantId, signals: readonly RecoverySignal[]): OrchestrationPlan => {
  const selectedRunbooks = signals.flatMap((signal) => {
    const runbookId = createRunbookId(`signal-${signal.id}`);
    return {
      id: runbookId,
      tenantId,
      name: `derived-${signal.id}`,
      description: `runbook generated from signal ${signal.id}`,
      steps: [],
      ownerTeam: 'lab-services',
      cadence: {
        weekday: signal.class === 'availability' ? 1 : 2,
        windowStartMinute: 15,
        windowEndMinute: 45,
      },
    };
  });

  return {
    tenantId,
    scenarioName: `workflow-${tenantId}`,
    schedule: [],
    runbooks: selectedRunbooks,
    dependencies: { nodes: [], edges: [] },
    estimatedCompletionMinutes: Math.max(1, signals.length + selectedRunbooks.length),
  };
};

const inferScore = (signals: readonly RecoverySignal[]): number => {
  if (signals.length === 0) {
    return 0;
  }

  return signals.reduce((acc, signal) => {
    const metadataWeight = typeof signal.metadata === 'object' && signal.metadata !== null && 'weight' in signal.metadata
      ? Number((signal.metadata as { weight?: unknown }).weight)
      : NaN;
    const weight = Number.isFinite(metadataWeight) ? metadataWeight : 1;
    return acc + severityRank[signal.severity] * weight;
  }, 0);
};

const buildWindowsFromTargets = (targets: readonly WorkloadTarget[]): readonly ReadinessWindow[] => {
  return targets
    .slice()
    .sort((left, right) => right.criticality - left.criticality)
    .map((target, index): ReadinessWindow => {
      return {
        runbookId: target.commandRunbookId,
        startAt: new Date(Date.now() + index * 1000).toISOString(),
        endAt: new Date(Date.now() + index * 1000 + 45_000).toISOString(),
        phaseOrder: ['observe', 'isolate', 'migrate', 'restore', 'verify', 'standdown'],
      };
    });
};

const buildNodesFromCatalog = (plugins: readonly PluginDefinition<unknown, unknown>[]): readonly WorkflowNode[] => {
  return plugins.map((plugin, index) => {
    const phase = normalizePhase(index % 6 === 0 ? 'seed' : index % 6 === 1 ? 'normalize' : index % 6 === 2 ? 'compose' : index % 6 === 3 ? 'simulate' : index % 6 === 4 ? 'audit' : 'finalize');
    return {
      id: buildNodeId(phase, index),
      title: `${plugin.name}-${phase}`,
      phase,
      inputType: 'unknown',
      outputType: 'unknown',
      dependencies: index > 0 ? [buildNodeId(phase, index - 1)] : [],
      execute: async (payload: unknown) => ({ ok: true, value: payload, generatedAt: new Date().toISOString() }),
    };
  });
};

export const buildWorkflow = (tenantId: TenantId, targets: readonly WorkloadTarget[], signals: readonly RecoverySignal[]): StudioWorkflow => {
  const windows = buildWindowsFromTargets(targets);
  const plugins = buildStudioCatalog(tenantId);
  return {
    id: `workflow-${tenantId}`,
    tenantId,
    nodes: buildNodesFromCatalog(plugins),
    signals,
    windows,
    targets,
    runbooks: planFromSignals(tenantId, signals).runbooks,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const executeWorkflow = async (
  workflow: StudioWorkflow,
  context: PluginContext<Record<string, unknown>>,
  registry: PluginRegistry,
): Promise<StudioPipelineOutput> => {
  const startedAt = new Date().toISOString();
  const phaseCoverage = collectPhaseWindows(workflow.windows);
  let current = workflow.targets as unknown;
  const auditTags: string[] = [];

  for (const node of workflow.nodes) {
    const plugin = registry.get<PluginDefinition<unknown, unknown>>(String(node.id));
    if (!plugin) {
      auditTags.push(`missing-plugin:${node.id}`);
      continue;
    }

    const result = await plugin.run(context, current);
    if (result.ok) {
      auditTags.push(`node:${node.id}:ok:${node.phase}`);
      current = result.value;
      continue;
    }

    auditTags.push(`node:${node.id}:error`);
  }

  const plan = planFromSignals(workflow.tenantId, workflow.signals);
  const simulation: RecoverySimulationResult = {
    tenantId: workflow.tenantId,
    startedAt: workflow.startedAt,
    endedAt: new Date().toISOString(),
    selectedRunbooks: plan.runbooks.map((runbook) => runbook.id),
    ticks: [],
    riskScore: inferScore(workflow.signals) / 10,
    slaCompliance: Math.min(1, inferScore(workflow.signals) / 100),
    notes: auditTags,
  };

  return {
    profile: {
      tenantId: workflow.tenantId,
      traceId: context.requestId,
      phaseCoverage,
      pluginKinds: registry.kinds() as PluginKind[],
      startedAt,
      finishedAt: new Date().toISOString(),
    },
    plan,
    simulation,
    auditTags,
  };
};

export const pickTopSignalsForWorkflow = (
  signals: readonly RecoverySignal[],
  limit: number,
): readonly RecoverySignal[] => {
  return [...signals]
    .sort((left, right) => severityRank[right.severity] - severityRank[left.severity])
    .slice(0, limit);
};

export type WorkflowByPhase<T extends readonly WorkflowNode[]> = {
  readonly [P in StudioPhase]: Extract<T[number], { phase: P }>[];
};

export const groupByPhase = <T extends readonly WorkflowNode[]>(nodes: T): WorkflowByPhase<T> => {
  const output = {
    seed: [] as Extract<T[number], { phase: 'seed' }>[],
    normalize: [] as Extract<T[number], { phase: 'normalize' }>[],
    compose: [] as Extract<T[number], { phase: 'compose' }>[],
    simulate: [] as Extract<T[number], { phase: 'simulate' }>[],
    audit: [] as Extract<T[number], { phase: 'audit' }>[],
    finalize: [] as Extract<T[number], { phase: 'finalize' }>[],
  } as WorkflowByPhase<T>;

  for (const node of nodes) {
    const phase = node.phase;
    (output[phase] as Extract<T[number], { phase: typeof phase }>[]).push(node as Extract<T[number], { phase: typeof phase }>);
  }
  return output as WorkflowByPhase<T>;
};

export const describeWorkflow = (workflow: StudioWorkflow): string => {
  const groups = groupByPhase(workflow.nodes);
  return [
    `seed=${groups.seed.length}`,
    `normalize=${groups.normalize.length}`,
    `compose=${groups.compose.length}`,
    `simulate=${groups.simulate.length}`,
    `audit=${groups.audit.length}`,
    `finalize=${groups.finalize.length}`,
  ].join(',');
};
