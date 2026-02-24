import { Brand } from '@shared/core';
import { type Result, fail, ok } from '@shared/result';
import { asIterable } from './iterator';
import {
  syntheticBuildDefaults,
  syntheticDomain,
  syntheticPhases,
  syntheticStatuses,
  syntheticRunPrefix,
} from './constants';
import {
  type SyntheticBlueprintId,
  type SyntheticCorrelationId,
  type SyntheticPhase,
  type SyntheticRunId,
  type SyntheticStatus,
  type SyntheticTenantId,
  type SyntheticWorkspaceId,
  type SyntheticPriorityBand,
  type SyntheticRunOutcome,
  type SyntheticPluginDefinition,
  type PluginChainCompatibility,
  type PluginChainOutput,
  type SyntheticExecutionContext,
  type SyntheticPluginResult,
  type PluginOutput,
  type SyntheticPlan,
  type SyntheticRunInputModel,
} from './contracts';
import { buildRuntimeContext } from './contracts';

const metadataSeed = {
  namespace: syntheticDomain,
  build: `${syntheticRunPrefix}${Date.now()}`,
  defaults: syntheticBuildDefaults,
} as const;

export interface RuntimeStep<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly index: number;
  readonly pluginId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly phase: SyntheticPhase;
  readonly input: TInput;
  readonly output: TOutput;
}

export interface RuntimeRunState {
  readonly runId: SyntheticRunId;
  readonly status: SyntheticStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly timeline: readonly RuntimeStep[];
  readonly warnings: readonly string[];
}

interface AsyncDisposer {
  use<T extends Disposable>(value: T): T;
  [Symbol.asyncDispose](): Promise<void>;
}

interface MaybeAsyncDisposable {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose]?(): PromiseLike<void> | void;
}

export const createAsyncDisposableStack = (): new () => AsyncDisposer => {
  const Ctor = (globalThis as unknown as { AsyncDisposableStack?: new () => AsyncDisposer }).AsyncDisposableStack;
  if (Ctor) {
    return Ctor;
  }

  return class {
    async [Symbol.asyncDispose](): Promise<void> {
      return Promise.resolve();
    }

    use<T extends Disposable>(value: T): T {
      return value;
    }
  };
};

export const toSnapshotStatus = (status: SyntheticStatus): SyntheticStatus =>
  status === 'succeeded' ? 'succeeded' : status;

const asDisposable = (label: string): MaybeAsyncDisposable => {
  return {
    [Symbol.dispose](): void {
      void label;
    },
  };
};

export interface RunAttemptResult<TChain extends readonly SyntheticPluginDefinition[]> {
  readonly runId: SyntheticRunId;
  readonly status: SyntheticStatus;
  readonly timeline: readonly RuntimeStep[];
  readonly output: PluginChainOutput<TChain> | undefined;
  readonly warnings: readonly string[];
}

export interface RuntimeConfig {
  readonly namespace?: string;
  readonly defaultTimeoutMs?: number;
  readonly maxRetries?: number;
}

export interface SyntheticRunResult<TOutput = unknown> {
  readonly runId: SyntheticRunId;
  readonly status: SyntheticStatus;
  readonly payload: TOutput;
  readonly phaseCount: number;
  readonly timeline: readonly RuntimeStep[];
}

export const createRuntimeContext = (options: {
  tenantId: SyntheticTenantId;
  workspaceId: SyntheticWorkspaceId;
  requestedBy: string;
  correlationId: SyntheticCorrelationId;
}): SyntheticExecutionContext =>
  buildRuntimeContext({
    tenantId: options.tenantId,
    workspaceId: options.workspaceId,
    runId: `${syntheticRunPrefix}${crypto.randomUUID()}` as SyntheticRunId,
    correlationId: options.correlationId,
    actor: options.requestedBy,
  });

export const runPluginChain = async <TChain extends readonly SyntheticPluginDefinition[]>(
  chain: PluginChainCompatibility<TChain>,
  plan: SyntheticPlan<TChain>,
  input: SyntheticRunInputModel,
  context: SyntheticExecutionContext,
  config: RuntimeConfig = {},
): Promise<Result<RunAttemptResult<TChain>, Error>> => {
  const ordered = asIterable(chain).filter((plugin) => syntheticPhases.includes(plugin.phase)).toArray();
  const timeline: RuntimeStep[] = [];
  const warnings: string[] = [];
  let stageInput: unknown = input;

  const AsyncStack = createAsyncDisposableStack();
  await using stack = new AsyncStack();

  try {
    for (const [index, plugin] of ordered.entries()) {
      const startedAt = new Date().toISOString();
      const stageLabel = `${context.runId}:${plugin.id}` as string;
      const scope = asDisposable(stageLabel);
      stack.use(scope as Disposable);

      const runResult = await plugin.execute(stageInput as never, context, plugin.config as never);
      const finishedAt = new Date().toISOString();
      const snapshot: RuntimeStep<unknown, unknown> = {
        id: `${plan.runId}:step:${index}`,
        index,
        pluginId: plugin.id,
        startedAt,
        finishedAt,
        phase: plugin.phase,
        input: stageInput,
        output: runResult.payload,
      };
      timeline.push(snapshot);
      warnings.push(...runResult.diagnostics);
      warnings.push(...runResult.warnings);

      if (!runResult.ok) {
        return ok({
          runId: context.runId,
          status: 'failed',
          timeline: [...timeline],
          output: undefined,
          warnings,
        } as RunAttemptResult<TChain>);
      }

      if (runResult.payload === undefined && plugin.weight > 0) {
        warnings.push(`plugin ${plugin.id} returned no payload`);
      }

      stageInput = runResult.payload;
    }

    return ok({
      runId: context.runId,
      status: 'succeeded',
      timeline,
      output: stageInput as PluginOutput<TChain[number]>,
      warnings: [...warnings],
    } as RunAttemptResult<TChain>);
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('execution-failed'));
  }
};

export const collectRunArtifacts = (
  timeline: readonly RuntimeStep[],
): { readonly phases: readonly SyntheticPhase[]; readonly pluginIds: readonly string[] } => {
  const phaseSet = new Set<SyntheticPhase>(timeline.map((entry) => entry.phase));
  return {
    phases: [...phaseSet],
    pluginIds: timeline.map((entry) => entry.pluginId),
  };
};

export interface BrandedSyntheticState<TPhase extends string = string> {
  readonly runId: SyntheticRunId;
  readonly domain: Brand<string, 'SyntheticDomain'>;
  readonly phase: TPhase;
  readonly phasePriority: SyntheticPriorityBand;
}

const defaultState = {
  runId: `${syntheticRunPrefix}seed` as SyntheticRunId,
  domain: syntheticDomain as Brand<string, 'SyntheticDomain'>,
  phase: syntheticPhases[0] as SyntheticPhase,
  phasePriority: syntheticBuildDefaults.maxRetries > 1 ? 'high' : 'medium',
} satisfies BrandedSyntheticState;

export const defaultRuntimeState = (tenantId: SyntheticTenantId): BrandedSyntheticState => ({
  ...defaultState,
  runId: `${syntheticRunPrefix}${tenantId}` as SyntheticRunId,
});

export const normalizeTimeline = (value: readonly RuntimeStep[]): readonly RuntimeStep[] =>
  value
    .map((step, index) => ({ ...step, id: `${step.id}:${index}` }))
    .toSorted((left, right) => left.startedAt.localeCompare(right.startedAt));
