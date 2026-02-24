import { Brand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import { z } from 'zod';
import {
  CommandRunbook,
  CommandStep,
  OrchestrationPlan,
  RecoverySignal,
  TenantId,
  WorkloadTarget,
  createWorkloadId,
  createRunbookId,
  createTenantId,
  createSignalId,
  createStepId,
  CommandRunbookId,
  WorkloadId,
} from './models';
import {
  PluginContext,
  PluginDefinition,
  type PluginKind,
  type PluginNamespace,
  buildPluginDefinition,
  runPluginSafe,
  type PluginResult,
  buildPluginVersion,
  canonicalizeNamespace,
} from '@shared/stress-lab-runtime';

export type WorkspaceId = Brand<string, 'RecoveryStressWorkspaceId'>;
export type WorkspaceToken = Brand<string, 'RecoveryStressWorkspaceToken'>;
export type WorkspaceRunId = Brand<string, 'RecoveryStressWorkspaceRun'>;

export type WorkspaceStage = 'discover' | 'shape' | 'plan' | 'simulate' | 'recommend' | 'report';
export type WorkspaceTag<T extends string> = `workspace/${T}`;
export type WorkspaceEventName = `${WorkspaceTag<string>}:v1`;
export type WorkspaceKey<T extends string> = `ws:${string & T}`;

const stageBudget: Record<WorkspaceStage, number> = {
  discover: 4,
  shape: 8,
  plan: 14,
  simulate: 20,
  recommend: 11,
  report: 6,
};

const budgetStageMap: Record<WorkspaceStage, keyof WorkspaceBudget> = {
  discover: 'discovered',
  shape: 'shaped',
  plan: 'planned',
  simulate: 'simulated',
  recommend: 'recommendations',
  report: 'recommendations',
};

const commandPhaseWeights = {
  observe: 2,
  isolate: 3,
  migrate: 3,
  restore: 4,
  verify: 2,
  standdown: 1,
} as const satisfies Record<CommandStep['phase'], number>;

export type WorkspaceInput<TSignals = readonly RecoverySignal[]> = {
  readonly tenantId: TenantId;
  readonly stage: WorkspaceStage;
  readonly runbooks: readonly CommandRunbook[];
  readonly targets: readonly WorkloadTarget[];
  readonly signals: NoInfer<TSignals>;
};

export type WorkspaceEnvelope<TConfig = Record<string, unknown>> = {
  readonly workspaceId: WorkspaceId;
  readonly runId: WorkspaceRunId;
  readonly tenantId: TenantId;
  readonly config: TConfig;
  readonly requestedAt: string;
  readonly token: WorkspaceToken;
};

export type WorkspaceStepSignature<TName extends string, TInput, TOutput> = {
  readonly name: WorkspaceKey<TName>;
  readonly input: TInput;
  readonly output: TOutput;
};

export type WorkspaceStepState<TName extends string, TPayload = unknown> = WorkspaceStepSignature<
  TName,
  { readonly accepted: boolean; readonly payload: TPayload },
  { readonly accepted: boolean; readonly stage: WorkspaceStage; readonly payload: TPayload }
>;

export type WorkspaceRunSignature = {
  readonly runId: WorkspaceRunId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly startedAt: string;
};

const WorkspaceSchema = z.object({
  tenantId: z.string().min(1),
  stage: z.enum(['discover', 'shape', 'plan', 'simulate', 'recommend', 'report']),
  runbooks: z.array(
    z.object({
      id: z.string().min(3),
      tenantId: z.string().min(1),
      name: z.string().min(1),
      description: z.string().min(1),
      ownerTeam: z.string().min(1),
      cadence: z.object({
        weekday: z.number().min(0).max(7),
        windowStartMinute: z.number().min(0).max(1439),
        windowEndMinute: z.number().min(0).max(1439),
      }),
      steps: z.array(
        z.object({
          commandId: z.string().min(1),
          title: z.string().min(1),
          phase: z.enum(['observe', 'isolate', 'migrate', 'restore', 'verify', 'standdown']),
          estimatedMinutes: z.number().min(0),
          prerequisites: z.array(z.string()),
          requiredSignals: z.array(z.string()),
        }),
      ),
    }),
  ),
});

type WorkspaceSchemaInput = z.input<typeof WorkspaceSchema>;

export const asWorkspaceInput = (input: WorkspaceSchemaInput): WorkspaceInput => {
  const safe = WorkspaceSchema.parse(input);
  return {
    tenantId: createTenantId(safe.tenantId),
    stage: safe.stage,
    runbooks: [],
    targets: [],
    signals: [],
  } as WorkspaceInput;
};

const buildSignatureId = (tenantId: TenantId, stage: WorkspaceStage): WorkspaceId =>
  `${tenantId}-${stage}-${Date.now()}` as WorkspaceId;

const buildWorkspaceRunId = (tenantId: TenantId, workspaceId: WorkspaceId): WorkspaceRunId =>
  `${tenantId}::${workspaceId}::run` as WorkspaceRunId;

const buildWorkspaceToken = (tenantId: TenantId, workspaceId: WorkspaceId): WorkspaceToken =>
  `${tenantId}::${workspaceId}::token` as WorkspaceToken;

const runbookBudget = (runbooks: readonly CommandRunbook[]): number =>
  runbooks.reduce((acc, runbook) => acc + runbook.steps.reduce((sum, step) => sum + step.estimatedMinutes, 0), 0);

const rankBySeverity = (signal: RecoverySignal): number =>
  signal.severity === 'critical' ? 4 : signal.severity === 'high' ? 3 : signal.severity === 'medium' ? 2 : 1;

const pickTopSignals = (signals: readonly RecoverySignal[]): ReadonlyArray<RecoverySignal> =>
  [...signals].sort((left, right) => rankBySeverity(right) - rankBySeverity(left)).slice(0, 5);

export interface WorkspaceBudget {
  readonly discovered: number;
  readonly shaped: number;
  readonly planned: number;
  readonly simulated: number;
  readonly recommendations: number;
}

const estimateWorkspaceBudget = (input: WorkspaceInput): WorkspaceBudget => {
  const base = runbookBudget(input.runbooks);
  const signalWeight = input.signals.length;
  return {
    discovered: base + stageBudget.discover + signalWeight,
    shaped: base + stageBudget.shape + signalWeight * 0.5,
    planned: base + stageBudget.plan + signalWeight * 1.1,
    simulated: base + stageBudget.simulate + signalWeight * 1.3,
    recommendations: base + stageBudget.recommend + signalWeight * 0.8,
  };
};

export interface WorkspaceOverview {
  readonly workspaceId: WorkspaceId;
  readonly runId: WorkspaceRunId;
  readonly token: WorkspaceToken;
  readonly tenantId: TenantId;
  readonly stage: WorkspaceStage;
  readonly targetCount: number;
  readonly runbookCount: number;
  readonly signalCount: number;
  readonly topSignalCount: number;
  readonly budgetMinutes: number;
  readonly commandPhases: readonly string[];
}

const composeCommandPhaseSequence = (runbook: CommandRunbook): readonly string[] =>
  runbook.steps.map((step) => step.phase);

export const buildWorkspaceOverview = (input: WorkspaceInput): WorkspaceOverview => {
  const topSignals = pickTopSignals(input.signals);
  const budget = estimateWorkspaceBudget(input);
  const stageBudgetValue = budget[budgetStageMap[input.stage]];
  const workspaceId = buildSignatureId(input.tenantId, input.stage);
  const runId = buildWorkspaceRunId(input.tenantId, workspaceId);
  const token = buildWorkspaceToken(input.tenantId, workspaceId);
  const commandPhases = input.runbooks.flatMap(composeCommandPhaseSequence);

  return {
    workspaceId,
    runId,
    token,
    tenantId: input.tenantId,
    stage: input.stage,
    targetCount: input.targets.length,
    runbookCount: input.runbooks.length,
    signalCount: input.signals.length,
    topSignalCount: topSignals.length,
    budgetMinutes: Math.round(stageBudgetValue + input.targets.length * 1.25),
    commandPhases,
  };
};

export interface WorkspacePlanSummary {
  readonly plan: OrchestrationPlan;
  readonly simulation: {
    readonly tenantId: TenantId;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly selectedRunbooks: readonly CommandRunbookId[];
    readonly ticks: readonly {
      timestamp: string;
      activeWorkloads: number;
      blockedWorkloads: readonly WorkloadId[];
      confidence: number;
    }[];
    readonly riskScore: number;
    readonly slaCompliance: number;
    readonly notes: readonly string[];
  } | null;
  readonly confidence: number;
  readonly signatures: readonly WorkspaceKey<string>[];
  readonly digest: string;
}

const composeDigest = (input: WorkspaceInput): string => {
  const signalIds = pickTopSignals(input.signals).map((signal) => signal.id).join(',');
  const runbookSignature = input.runbooks.map((runbook) => `${runbook.id}:${runbook.steps.length}`).join('|');
  const phaseSignature = input.runbooks
    .flatMap((runbook) => runbook.steps.map((step) => `${step.commandId}:${commandPhaseWeights[step.phase]}`))
    .join('|');
  return `${input.tenantId}:${input.stage}:${signalIds}:${runbookSignature}:${phaseSignature}`;
};

const buildTicks = (runbooks: readonly CommandRunbook[]) => {
  return runbooks.flatMap((runbook, runbookIndex) =>
    runbook.steps.map((step, stepIndex) => ({
      timestamp: new Date(Date.now() + (runbookIndex + stepIndex) * 5_000).toISOString(),
      activeWorkloads: runbook.steps.length + stepIndex,
      blockedWorkloads: [] as WorkloadId[],
      confidence: 0.62 + runbookIndex * 0.04 + stepIndex * 0.01,
    })),
  );
};

export const buildWorkspaceSummary = (input: WorkspaceInput): WorkspacePlanSummary => {
  const topology = input.targets;
  const digest = composeDigest(input);
  const selected = input.runbooks;
  const targetIndex = new Map(topology.map((entry) => [entry.workloadId, entry] as const));
  const plan: OrchestrationPlan = {
    tenantId: input.tenantId,
    scenarioName: `${input.tenantId}-${input.stage}-auto`,
    schedule: topology.slice(0, 3).map((target) => ({
      runbookId: target.commandRunbookId,
      startAt: new Date().toISOString(),
      endAt: new Date().toISOString(),
      phaseOrder: ['observe', 'isolate', 'restore'],
    })),
    runbooks: selected,
    dependencies: {
      nodes: topology.map((entry) => entry.workloadId),
      edges: topology.flatMap((entry) =>
        entry.dependencies.map((dependency) => ({
          from: entry.workloadId,
          to: dependency,
          weight: 0.45,
          coupling: 0.45,
          reason: `stress-lab/${targetIndex.get(dependency)?.name ?? 'fallback'}`,
          fromCriticality: entry.criticality,
          toCriticality: targetIndex.get(dependency)?.criticality ?? entry.criticality,
        })),
      ),
    },
    estimatedCompletionMinutes: estimateWorkspaceBudget(input).planned,
  };

  const simulation = selected.length > 0
    ? {
      tenantId: input.tenantId,
      startedAt: new Date().toISOString(),
      endedAt: new Date(Date.now() + Math.max(1_000, estimateWorkspaceBudget(input).simulated) * 1_000).toISOString(),
      selectedRunbooks: selected.map((runbook) => runbook.id),
      ticks: buildTicks(selected),
      riskScore: input.signals.length === 0 ? 0.2 : Math.min(1, 0.42 + input.signals.length * 0.04),
      slaCompliance: Math.max(0.6, 0.96 - input.signals.length * 0.01),
      notes: [
        `stage=${input.stage}`,
        `runbooks=${selected.length}`,
        `targets=${topology.length}`,
        `digest=${digest}`,
      ],
    }
    : null;

  return {
    plan,
    simulation,
    confidence: simulation ? simulation.riskScore / 2 : 0.4,
    signatures: selected.map((runbook) => `ws:${runbook.id}` as WorkspaceKey<string>),
    digest,
  };
};

export interface WorkspacePluginPayload {
  readonly workspaceId: WorkspaceId;
  readonly tenantId: TenantId;
  readonly stage: WorkspaceStage;
  readonly runId: WorkspaceRunId;
}

export type WorkspaceContext<T extends object = Record<string, unknown>> = {
  readonly tenantId: TenantId;
  readonly stage: WorkspaceStage;
  readonly workspaceId: WorkspaceId;
  readonly runId: WorkspaceRunId;
  readonly payload: T;
};

export const createWorkspaceContext = <T extends object>(
  tenantId: TenantId,
  stage: WorkspaceStage,
  workspaceId: WorkspaceId,
  runId: WorkspaceRunId,
  payload: NoInfer<T>,
): WorkspaceContext<T> => ({
  tenantId,
  stage,
  workspaceId,
  runId,
  payload,
});

const workspaceTagFromStage = (stage: WorkspaceStage): WorkspaceTag<WorkspaceStage> => `workspace/${stage}` as WorkspaceTag<WorkspaceStage>;

export const createWorkspaceAdapter = <
  TInput extends Record<string, unknown> = WorkspaceInput,
  TOutput extends Record<string, unknown> = WorkspaceStepState<string>,
>(
  name: string,
  namespace: PluginNamespace,
  kind: PluginKind,
  kindRef: WorkspaceStage,
  run: (context: PluginContext<{ readonly kind: WorkspaceStage; readonly namespace: PluginNamespace; readonly accepted: true }>, input: TInput) => Promise<PluginResult<TOutput>>,
): PluginDefinition<TInput, TOutput, { readonly kind: WorkspaceStage; readonly namespace: PluginNamespace; readonly accepted: true }, PluginKind> =>
  buildPluginDefinition(namespace, kind, {
    name,
    version: buildPluginVersion(1, 1, 0),
    tags: [workspaceTagFromStage(kindRef), `tenant:${name}`],
    dependencies: ['dep:recovery:stress:lab'],
    pluginConfig: { kind: kindRef, namespace, accepted: true },
    run,
  } as const);

export const createWorkspaceFromJson = (payload: unknown): WorkspaceInput => {
  const safe = asWorkspaceInput(payload as WorkspaceSchemaInput);
  const tenantId = createTenantId(safe.tenantId);
  const runbooks = safe.runbooks.map((entry) => {
    const commands = entry.steps.map((step, index) => ({
      commandId: createStepId(`${entry.id}-step-${index}`),
      title: step.title,
      phase: step.phase,
      estimatedMinutes: step.estimatedMinutes,
      prerequisites: step.prerequisites,
      requiredSignals: step.requiredSignals.map(createSignalId),
    }));

    return {
      id: createRunbookId(entry.id),
      tenantId,
      name: entry.name,
      description: entry.description,
      steps: commands,
      ownerTeam: entry.ownerTeam,
      cadence: entry.cadence,
    } as CommandRunbook;
  });

  const targetEntries = safe.runbooks.flatMap((runbook, index) =>
    runbook.steps.map((step) => ({
      tenantId,
      workloadId: createWorkloadId(`${tenantId}-${String(index)}-${step.commandId}`),
      commandRunbookId: createRunbookId(runbook.id),
      name: step.title,
      criticality: Math.min(5, Math.max(1, step.requiredSignals.length + 1)) as WorkloadTarget['criticality'],
      region: 'global',
      azAffinity: [`zone-${index}`],
      baselineRtoMinutes: step.estimatedMinutes,
      dependencies: index > 0 ? [createWorkloadId(`${tenantId}-${String(index - 1)}`)] : [],
    })),
  );

const signalEntries = safe.runbooks.flatMap((runbook) =>
    runbook.steps.flatMap((step) =>
      step.requiredSignals.map((signalId) => ({
        id: createSignalId(`${runbook.id}-${signalId}`),
        class: 'availability' as const,
        severity: 'medium' as const,
        title: `${runbook.name}:${step.title}`,
        createdAt: new Date().toISOString(),
        metadata: { requiredBy: runbook.id, step: step.commandId },
      })),
    ),
  );

  return {
    tenantId,
    stage: safe.stage,
    runbooks,
    targets: targetEntries,
    signals: signalEntries,
  };
};

export const runWorkspacePlugins = async (
  plugins: readonly PluginDefinition<WorkspaceInput, WorkspaceStepState<string>, Record<string, unknown>, PluginKind>[],
  input: WorkspaceInput,
): Promise<ReadonlyArray<WorkspaceStepState<string>>> => {
  const states = [] as WorkspaceStepState<string>[];

  const context: PluginContext<Record<string, unknown>> = {
    tenantId: input.tenantId,
    requestId: `ws:${input.tenantId}:${Date.now()}`,
    namespace: canonicalizeNamespace('recovery:stress:lab'),
    startedAt: new Date().toISOString(),
    config: input,
  };

  for (const plugin of plugins) {
    const output = await runPluginSafe(plugin, context, input);
    if (!output.ok) {
      break;
    }

    states.push({
      name: `ws:${plugin.id}` as WorkspaceKey<string>,
      input: { accepted: true, payload: input as WorkspaceInput },
      output: { accepted: true, stage: input.stage, payload: { from: plugin.id, status: 'ok' } },
    });
  }

  return states;
};

export const summarizeWorkspaceSignals = (signals: readonly RecoverySignal[]) => {
  const total = signals.length;
  const severityMap = new Map<RecoverySignal['severity'], number>([
    ['critical', 0],
    ['high', 0],
    ['medium', 0],
    ['low', 0],
  ]);

  for (const signal of signals) {
    severityMap.set(signal.severity, (severityMap.get(signal.severity) ?? 0) + 1);
  }

  const buckets = Array.from(severityMap.entries()).map(([severity, count]) => ({ severity, count }));
  return {
    total,
    bySeverity: Object.fromEntries(buckets.map((entry) => [entry.severity, entry.count])) as Record<RecoverySignal['severity'], number>,
    topSignalCount: Math.min(total, 5),
  };
};

const stageDefaults = {
  discover: 'discover',
  shape: 'shape',
  plan: 'plan',
  simulate: 'simulate',
  recommend: 'recommend',
  report: 'report',
} as const satisfies Record<WorkspaceStage, WorkspaceStage>;

export const normalizeWorkspaceStage = (input: WorkspaceStage): WorkspaceStage => stageDefaults[input];
