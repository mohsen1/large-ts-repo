import { fail, ok, type Result } from '@shared/result';
import {
  type LabPlugin,
  type LabRuntimeEvent,
  type PluginCategory,
  type PluginHandlePayload,
  type LabStage,
  type LabScope,
  type LabPluginId,
  type LabPluginName,
  type WorkspaceDraftInput,
  type WorkspaceBlueprint,
  createPluginId,
  createRunId,
  createTenantId,
  createWorkspaceId,
  pluginChainWeight,
  defaultLabStages,
  defaultLifecycleWeights,
} from './types.js';

const eventTimestamp = (event: LabRuntimeEvent): string => {
  switch (event.kind) {
    case 'plugin.started':
      return event.startedAt;
    case 'plugin.failed':
      return event.failedAt;
    case 'plugin.completed':
    case 'run.complete':
      return event.completedAt;
  }
};

export interface RawPluginManifest {
  readonly tenant: string;
  readonly category: PluginCategory;
  readonly stage: LabStage;
  readonly scope: LabScope;
  readonly name: string;
  readonly dependencies: readonly string[];
  readonly version: `${number}.${number}.${number}`;
}

export const parsePluginManifest = (value: unknown): Result<RawPluginManifest, Error> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(new Error('invalid manifest'));
  }

  const candidate = value as Partial<RawPluginManifest>;
  const version = candidate.version ?? '0.1.0';
  if (typeof candidate.tenant !== 'string' || candidate.tenant.length < 3) {
    return fail(new Error('invalid tenant'));
  }
  if (typeof candidate.category !== 'string') {
    return fail(new Error('invalid category'));
  }
  if (typeof candidate.stage !== 'string') {
    return fail(new Error('invalid stage'));
  }
  if (typeof candidate.scope !== 'string') {
    return fail(new Error('invalid scope'));
  }
  if (typeof candidate.name !== 'string') {
    return fail(new Error('invalid name'));
  }

  return ok({
    tenant: candidate.tenant,
    category: candidate.category,
    stage: candidate.stage,
    scope: candidate.scope,
    name: candidate.name,
    dependencies: candidate.dependencies ?? [],
    version,
  });
};

export const parseRuntimeEvent = (value: unknown): Result<LabRuntimeEvent, Error> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(new Error('invalid event'));
  }

  const candidate = value as {
    kind?: string;
    pluginId?: string;
    stage?: string;
    completedAt?: string;
    startedAt?: string;
    durationMs?: number;
    details?: unknown;
    failedAt?: string;
    error?: string;
    runId?: string;
    diagnostics?: unknown;
  };

  if (candidate.kind === 'plugin.started') {
    return ok({
      kind: 'plugin.started',
      pluginId: candidate.pluginId as LabPluginId,
      stage: candidate.stage as LabStage,
      startedAt: String(candidate.startedAt ?? new Date().toISOString()),
      details: candidate.details,
    });
  }

  if (candidate.kind === 'plugin.completed') {
    return ok({
      kind: 'plugin.completed',
      pluginId: candidate.pluginId as LabPluginId,
      stage: candidate.stage as LabStage,
      completedAt: String(candidate.completedAt ?? new Date().toISOString()),
      durationMs: Number(candidate.durationMs ?? 0),
      details: candidate.details,
    });
  }

  if (candidate.kind === 'plugin.failed') {
    return ok({
      kind: 'plugin.failed',
      pluginId: candidate.pluginId as LabPluginId,
      stage: candidate.stage as LabStage,
      failedAt: String(candidate.failedAt ?? new Date().toISOString()),
      error: String(candidate.error ?? 'unknown'),
      details: candidate.details,
    });
  }

  if (candidate.kind === 'run.complete') {
    return ok({
      kind: 'run.complete',
      runId: createRunId('run', 'audit'),
      stage: 'audit',
      completedAt: String(candidate.completedAt ?? new Date().toISOString()),
      diagnostics: {
        timeline: [...defaultLabStages],
        stageCount: defaultLabStages.length,
        trace: ['manual.trace'],
      },
    });
  }

  return fail(new Error('unsupported event kind'));
};

export const buildLabPluginDefinition = <
  TName extends string,
  TInput = unknown,
  TOutput = unknown,
  TConsumes extends string[] = string[],
  TEmits extends string[] = string[],
>(
  input: {
    readonly name: TName;
    readonly tenant: string;
    readonly scope: LabScope;
    readonly stage: LabStage;
    readonly category: PluginCategory;
    readonly dependencies?: readonly string[];
    readonly consumes?: readonly string[];
    readonly emits?: readonly string[];
    readonly run: (input: TInput, context: { readonly tenant: string }) => Promise<TOutput>;
  },
): LabPlugin<TName, TInput, TOutput, TConsumes, TEmits, PluginCategory, LabStage, LabScope> => {
  const manifest: RawPluginManifest = {
    tenant: input.tenant,
    category: input.category,
    stage: input.stage,
    scope: input.scope,
    name: input.name,
    dependencies: input.dependencies ?? [],
    version: '0.1.0',
  };
  const parsed = parsePluginManifest(manifest);
  if (!parsed.ok) {
    throw parsed.error;
  }

  return {
    id: createPluginId(input.name, input.category, input.stage),
    name: input.name as LabPluginName & TName,
    category: input.category,
    scope: input.scope,
    stage: input.stage,
    dependencies: (input.dependencies ?? []).map((dependency) => createPluginId(dependency, input.category, input.stage)),
    consumes: (input.consumes ?? []) as TConsumes,
    emits: (input.emits ?? []) as TEmits,
    version: parsed.value.version,
    async run(value: TInput) {
      return input.run(value, { tenant: input.tenant });
    },
  };
};

export const normalizeWorkspaceDraft = <TSignals extends readonly string[]>(draft: WorkspaceDraftInput<TSignals>): WorkspaceBlueprint => {
  const template: WorkspaceBlueprint = {
    workspaceId: createWorkspaceId('tenant.synthetic', 'bootstrap'),
    tenantId: createTenantId('tenant.synthetic'),
    name: draft.workspace.name,
    labels: ['normalized', ...draft.workspace.labels],
    stages: [...defaultLabStages],
    createdAt: new Date().toISOString(),
  };

  return template;
};

export const validateChainWeight = <TChain extends readonly LabRuntimeEvent[]>(chain: TChain): PluginHandlePayload<TChain> => {
  const events = [...chain].toSorted((left, right) => {
    const leftAt = eventTimestamp(left);
    const rightAt = eventTimestamp(right);
    return leftAt.localeCompare(rightAt);
  });
  const first = events[0];
  const last = events.at(-1);
  return {
    input: chain,
    startedAt: first ? eventTimestamp(first) : new Date().toISOString(),
    endedAt: last ? eventTimestamp(last) : new Date().toISOString(),
  };
};

export const weightByStageOrder = (stages: readonly LabStage[]): number =>
  pluginChainWeight(stages.filter((stage) => Object.prototype.hasOwnProperty.call(defaultLifecycleWeights, stage)));
