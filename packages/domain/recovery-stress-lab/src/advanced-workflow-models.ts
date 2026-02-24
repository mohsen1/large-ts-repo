import { type Brand, normalizeLimit, type Graph, type NodeId } from '@shared/core';
import {
  CommandRunbook,
  CommandRunbookId,
  OrchestrationPlan,
  RecoverySignal,
  RecoverySignalId,
  RecoverySimulationResult,
  SeverityBand,
  TenantId,
  WorkloadId,
  WorkloadTarget,
  createRunbookId,
  createSignalId,
  createTenantId,
  createWorkloadId,
} from './models';
import { type DeepReadonly, type NoInfer, type OmitNever, type Prettify, type UnionToIntersection } from '@shared/type-level';

export type {
  RecoverySignal,
  RecoverySignalId,
  TenantId,
  WorkloadId,
  WorkloadTarget,
  CommandRunbookId,
  CommandRunbook,
  OrchestrationPlan,
  RecoverySimulationResult,
  SeverityBand,
};

export type WorkflowStage =
  | 'input'
  | 'shape'
  | 'plan'
  | 'simulate'
  | 'recommend'
  | 'report'
  | 'finalize';

export type WorkflowMode = 'conservative' | 'adaptive' | 'agile';
export type WorkflowRunId = Brand<string, 'WorkflowRunId'>;
export type WorkflowStageRoute<T extends WorkflowStage = WorkflowStage> = `${T}:phase`;
export type RouteByStage<T extends WorkflowStage = WorkflowStage> = WorkflowStageRoute<T>;
export type WorkflowEventTag<TScope extends string = 'advanced-workflow', TStage extends WorkflowStage = WorkflowStage> =
  `${TScope}#${TStage}#event`;
export type StageMetadataKey<T> = T extends string ? `stage:${T}` : never;

export type StageDiagnosticsByStage<T extends string = WorkflowStage> = Partial<{
  [K in T as K extends string ? StageMetadataKey<K> : never]: {
    readonly index: number;
    readonly stage: K;
    readonly events: readonly string[];
  };
}>;

export interface WorkflowRunMetadata {
  readonly runId: WorkflowRunId;
  readonly workspaceTenantId: TenantId;
  readonly startedAt: string;
}

export type StageEnvelopeMeta = WorkflowRunMetadata;

export interface WorkflowRunbookSeed {
  readonly id: CommandRunbookId;
  readonly severityBand: SeverityBand;
  readonly runbookTitle: string;
}

export interface WorkflowWorkspaceSeed {
  readonly tenantId: TenantId;
  readonly runbooks: readonly WorkflowRunbookSeed[];
  readonly signals: readonly RecoverySignal[];
  readonly targets: readonly WorkloadTarget[];
  readonly requestedBand: SeverityBand;
  readonly mode: WorkflowMode;
}

export type WorkspaceSeedInput = {
  readonly tenantId: TenantId;
  readonly runbooks: readonly {
    readonly id: string;
    readonly severityBand?: SeverityBand;
    readonly runbookTitle: string;
  }[];
  readonly signals: readonly {
    readonly id: string;
    readonly class: RecoverySignal['class'];
    readonly severity: RecoverySignal['severity'];
    readonly title: string;
    readonly createdAt: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  }[];
  readonly targets: readonly {
    readonly tenantId?: TenantId;
    readonly workloadId?: string;
    readonly commandRunbookId?: string;
    readonly name: string;
    readonly criticality: WorkloadTarget['criticality'];
    readonly region: string;
    readonly azAffinity: readonly string[];
    readonly baselineRtoMinutes: number;
    readonly dependencies: readonly string[];
  }[];
  readonly requestedBand: SeverityBand;
  readonly mode: WorkflowMode;
};

export type WorkflowTopology = Graph<NodeId, { readonly coupling: number; readonly reason: string }>;
export type TopologyEdgePayload = WorkflowTopology['edges'][number]['payload'];
export type WorkflowRecommendation = { readonly runbookId: CommandRunbookId; readonly reason: string };

export type WorkflowStageOutput<
  TStage extends WorkflowStage,
  TPayload extends Record<string, unknown> = Record<string, never>,
  TMeta extends StageEnvelopeMeta = StageEnvelopeMeta,
> = Prettify<
  TMeta & {
    readonly runId: WorkflowRunId;
    readonly workspaceTenantId: TenantId;
    readonly startedAt: string;
    readonly stage: TStage;
    readonly route: WorkflowStageRoute<TStage>;
    readonly payload: TPayload;
    readonly tag: WorkflowEventTag<'advanced-workflow', TStage>;
  }
>;

export type WorkflowInputEnvelope = WorkflowStageOutput<'input', { readonly workspace: Readonly<WorkflowWorkspaceSeed> }, StageEnvelopeMeta>;

type WorkflowCommonPayload = {
  readonly workspace: Readonly<WorkflowWorkspaceSeed>;
};

export type WorkflowShapeEnvelope = WorkflowStageOutput<
  'shape',
  WorkflowCommonPayload & {
    readonly selectedSignals: readonly RecoverySignal[];
    readonly topology: WorkflowTopology;
    readonly signalBuckets: readonly { readonly className: RecoverySignal['class']; readonly count: number }[];
  },
  StageEnvelopeMeta
>;

export type WorkflowPlanEnvelope = WorkflowStageOutput<
  'plan',
  WorkflowCommonPayload & {
    readonly plan: OrchestrationPlan;
    readonly ranking: readonly { readonly runbookId: CommandRunbookId; readonly score: number }[];
  },
  StageEnvelopeMeta
>;

export type WorkflowSimulationEnvelope = WorkflowStageOutput<
  'simulate',
  WorkflowCommonPayload & {
    readonly simulation: RecoverySimulationResult;
    readonly riskEnvelope: { readonly riskScore: number; readonly sla: number };
  },
  StageEnvelopeMeta
>;

export type WorkflowRecommendationEnvelope = WorkflowStageOutput<
  'recommend',
  WorkflowCommonPayload & {
    readonly recommendations: readonly WorkflowRecommendation[];
    readonly summary: string;
  },
  StageEnvelopeMeta
>;

export type WorkflowReportEnvelope = WorkflowStageOutput<
  'report',
  WorkflowCommonPayload & {
    readonly stages: readonly WorkflowExecutionStage[];
    readonly traces: readonly WorkflowExecutionTrace[];
    readonly simulation: RecoverySimulationResult | null;
    readonly plan: OrchestrationPlan | null;
    readonly topSignals: readonly RecoverySignalId[];
    readonly selectedBands: {
      readonly baseline: SeverityBand;
      readonly final: SeverityBand;
      readonly drift: number;
    };
    readonly recommendations: readonly WorkflowRecommendation[];
  },
  StageEnvelopeMeta
>;

export type WorkflowFinalizeEnvelope = WorkflowStageOutput<
  'finalize',
  WorkflowReportEnvelope['payload'] & {
    readonly finalizedAt: string;
    readonly diagnostics: readonly string[];
  },
  StageEnvelopeMeta
>;

export type WorkflowEnvelope =
  | WorkflowInputEnvelope
  | WorkflowShapeEnvelope
  | WorkflowPlanEnvelope
  | WorkflowSimulationEnvelope
  | WorkflowRecommendationEnvelope
  | WorkflowReportEnvelope
  | WorkflowFinalizeEnvelope;

export type WorkflowExecutionResultEnvelope = WorkflowReportEnvelope | WorkflowFinalizeEnvelope;

export interface WorkflowExecutionStage {
  readonly stage: WorkflowStage;
  readonly route: WorkflowStageRoute;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly elapsedMs: number;
}

export interface WorkflowExecutionTrace {
  readonly sequence: number;
  readonly stage: WorkflowStage;
  readonly pluginId: string;
  readonly ok: boolean;
  readonly message: string;
}

export interface WorkflowExecutionResult {
  readonly runId: WorkflowRunId;
  readonly tenantId: TenantId;
  readonly stages: readonly WorkflowExecutionStage[];
  readonly traces: readonly WorkflowExecutionTrace[];
  readonly stageSummary: StageDiagnosticsByStage;
  readonly workspace: Readonly<WorkflowWorkspaceSeed>;
  readonly simulation: RecoverySimulationResult | null;
  readonly plan: OrchestrationPlan | null;
  readonly recommendations: readonly string[];
}

export const WORKFLOW_STAGES = [
  'input',
  'shape',
  'plan',
  'simulate',
  'recommend',
  'report',
  'finalize',
] as const satisfies readonly WorkflowStage[];

export const STAGE_LIMIT = 15 satisfies number;
export const STAGE_WEIGHTS = {
  input: 5,
  shape: 10,
  plan: 20,
  simulate: 25,
  recommend: 18,
  report: 9,
  finalize: 4,
} as const satisfies Record<WorkflowStage, number>;

export const BANDS_ORDER = ['low', 'medium', 'high', 'critical'] as const satisfies readonly SeverityBand[];

const clampCriticality = (value: number): WorkloadTarget['criticality'] =>
  normalizeLimit(Math.max(1, Math.min(5, Math.floor(value)))) as WorkloadTarget['criticality'];

const normalizeRunbookIds = (seed: WorkspaceSeedInput): readonly WorkflowRunbookSeed[] =>
  seed.runbooks.map((runbook) => ({
    id: createRunbookId(runbook.id),
    severityBand: runbook.severityBand ?? 'medium',
    runbookTitle: runbook.runbookTitle,
  }));

export type WorkspaceSignalPath =
  | 'tenantId'
  | 'requestedBand'
  | 'mode'
  | `signals.${RecoverySignal['class']}`
  | `targets.${string}`
  | `runbooks.${string}`;

export const resolveWorkspacePath = <
  TPath extends WorkspaceSignalPath,
>(workspace: WorkflowWorkspaceSeed, path: NoInfer<TPath>): unknown => {
  if (!path.includes('.')) {
    return workspace[path as keyof WorkflowWorkspaceSeed];
  }
  const [root, ...parts] = path.split('.') as readonly string[];
  let current: unknown = workspace;
  for (const segment of [root, ...parts]) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object' && segment in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
};

export const collectSignalClassPaths = (workspace: WorkflowWorkspaceSeed): readonly WorkspaceSignalPath[] => [
  'tenantId',
  'requestedBand',
  'mode',
  ...workspace.signals.map((signal): WorkspaceSignalPath => `signals.${signal.class}`),
  ...workspace.targets.map((target): WorkspaceSignalPath => `targets.${target.name}`),
  ...workspace.runbooks.map((runbook): WorkspaceSignalPath => `runbooks.${runbook.id}`),
];

export const createWorkflowRunId = (tenant: TenantId, channel = 'run'): WorkflowRunId => {
  const safeSeed = String(tenant).replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  return `${channel}:${safeSeed}:${Date.now()}` as WorkflowRunId;
};

export const normalizeAdvancedWorkspace = (seed: WorkspaceSeedInput): WorkflowWorkspaceSeed => ({
  tenantId: seed.tenantId,
  runbooks: normalizeRunbookIds(seed),
  signals: [...seed.signals].map((signal, index) => ({
    ...signal,
    id: createSignalId(signal.id),
    metadata: {
      ...signal.metadata,
      inferredIndex: index,
      severityRank: BANDS_ORDER.indexOf(signal.severity) + 1,
    },
  })),
  targets: [...seed.targets].map((target, index) => ({
    tenantId: target.tenantId ?? createTenantId(String(seed.tenantId)),
    workloadId: createWorkloadId(target.workloadId ?? `target-${String(seed.tenantId)}-${index}`),
    commandRunbookId: createRunbookId(target.commandRunbookId ?? `runbook-${String(seed.tenantId)}-${index}`),
    name: target.name,
    criticality: clampCriticality(target.criticality),
    region: target.region,
    azAffinity: [...target.azAffinity],
    baselineRtoMinutes: normalizeLimit(target.baselineRtoMinutes),
    dependencies: target.dependencies.map((dependency) => createWorkloadId(dependency)),
  })),
  requestedBand: seed.requestedBand,
  mode: seed.mode,
});

export const topSignals = (workspace: WorkflowWorkspaceSeed): readonly RecoverySignal[] =>
  [...workspace.signals]
    .sort((left, right) => BANDS_ORDER.indexOf(right.severity) - BANDS_ORDER.indexOf(left.severity))
    .slice(0, Math.min(8, normalizeLimit(workspace.signals.length)));

export const buildAdvancedTopologyGraph = (workspace: WorkflowWorkspaceSeed): WorkflowTopology => {
  const nodes = workspace.targets.map((target) => target.workloadId);
  const dependencyEdges = workspace.targets.flatMap((source) =>
    source.dependencies.map((dependency, index) => ({
      from: source.workloadId,
      to: createWorkloadId(dependency),
      weight: clampCriticality(source.criticality + index + 1),
      payload: {
        coupling: normalizeLimit((source.criticality * 0.2) + 0.2),
        reason: `dependency:${String(source.workloadId)}->${String(dependency)}`,
      },
    })),
  );

  const selfEdges = workspace.targets.map((target) => ({
    from: target.workloadId,
    to: target.workloadId,
    weight: 1,
    payload: {
      coupling: 1,
      reason: `self:${target.name}`,
    },
  }));

  return {
    nodes,
    edges: [...selfEdges, ...dependencyEdges],
  };
};

export const deriveTopologyBudget = (workspace: WorkflowWorkspaceSeed): readonly number[] =>
  workspace.targets.map((target) => clampCriticality(target.criticality * 5 + target.azAffinity.length));

export const summarizeTargetPath = (workspace: WorkflowWorkspaceSeed): DeepReadonly<`tenant:${TenantId}::targets:${number}::runbooks:${number}`> =>
  `tenant:${workspace.tenantId}::targets:${workspace.targets.length}::runbooks:${workspace.runbooks.length}` as DeepReadonly<
    `tenant:${TenantId}::targets:${number}::runbooks:${number}`
  >;

export const stageEnvelopeRoute = <T extends WorkflowStage>(stage: NoInfer<T>): WorkflowStageRoute<T> => `${stage}:phase` as WorkflowStageRoute<T>;

export const mergeWorkspaceByDepth = (
  root: WorkflowWorkspaceSeed,
  patch: Partial<WorkflowWorkspaceSeed>,
): WorkflowWorkspaceSeed => ({
  ...root,
  ...patch,
  runbooks: patch.runbooks ?? root.runbooks,
  signals: patch.signals ?? root.signals,
  targets: patch.targets ?? root.targets,
});

export const computeStageDigest = (
  stage: WorkflowExecutionStage,
  prior: ReadonlyMap<WorkflowStage, number>,
): number => {
  const weight = STAGE_WEIGHTS[stage.stage] ?? 0;
  const offset = prior.get(stage.stage) ?? 0;
  return normalizeLimit(weight + (stage.elapsedMs % 100) + offset);
};

export const summarizeExecutionResult = (result: WorkflowExecutionResult): {
  readonly route: string;
  readonly signalCount: number;
  readonly severity: SeverityBand;
  readonly runbooks: number;
} => {
  const route = result.stages.map((entry) => entry.stage).join('>');
  const signalCount = result.workspace.signals.length + result.workspace.runbooks.length + result.traces.length;
  return {
    route,
    signalCount,
    severity: result.workspace.requestedBand,
    runbooks: result.workspace.runbooks.length,
  };
};

export type StageTuple<T extends readonly WorkflowStage[]> =
  T extends readonly [infer Head extends WorkflowStage, ...infer Tail extends readonly WorkflowStage[]]
    ? readonly [Head, ...StageTuple<Tail>]
    : readonly [];

export type RouteLabel<TOutput> = TOutput extends { readonly stage: infer Stage extends WorkflowStage }
  ? Stage
  : never;

export type EnvelopeInput<TEnvelope> = TEnvelope extends WorkflowStageOutput<infer Stage, infer Payload>
  ? { readonly stage: Stage; readonly payload: Payload }
  : never;

export type StageOutputByKind<
  TStages extends readonly WorkflowEnvelope[],
  TNeedStage extends WorkflowStage,
> = {
  [K in keyof TStages]: RouteLabel<TStages[K]> extends TNeedStage ? TStages[K] : never;
}[number];

export type StageUnion = UnionToIntersection<WorkflowEnvelope>;

export const toWorkspaceTargetsTuple = (
  targets: readonly WorkloadTarget[],
): [] | readonly [WorkloadTarget, ...WorkloadTarget[]] =>
  targets.length === 0 ? [] : [targets[0], ...targets.slice(1)];

export const workspaceMeta = <T extends WorkflowWorkspaceSeed>(workspace: T) => ({
  tenant: workspace.tenantId,
  runbookCount: workspace.runbooks.length,
  targetCount: workspace.targets.length,
}) satisfies OmitNever<{
  tenant: TenantId;
  runbookCount: number;
  targetCount: number;
}>;
