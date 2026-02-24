import { Brand } from '@shared/core';
import {
  type PluginDefinition,
  type PluginId,
  type PluginKind,
  type PluginNamespace,
  type PluginDefinitionInput,
  type PluginDefinitionOutput,
  CompatibleChain,
} from './plugin-registry';
import { collectIterable, mapIterable } from './iterator-utils';
import { canonicalizeNamespace } from './ids';

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type WorkflowToken<T extends string> = Brand<string, `${T}:token`>;
export type WorkflowStepId = Brand<string, 'StressLabWorkflowStepId'>;
export type WorkflowRunId = Brand<string, 'StressLabWorkflowRunId'>;

export type WorkflowStage =
  | 'plan'
  | 'shape'
  | 'simulate'
  | 'recommend'
  | 'report'
  | 'finalize'
  | 'input';

export type StageLabel<T extends WorkflowStage> = `${T}:phase`;
export type StageEventName<T extends string> = `${T}:event:${string}`;

export type TupleUnroll<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [Head, ...TupleUnroll<Tail & readonly unknown[]>]
  : readonly [];

export type ChainStepIds<T extends readonly PluginDefinition[]> = {
  [I in keyof T]: T[I] extends PluginDefinition<any, any, any, infer Kind>
    ? `${string & Kind}::${I & number}`
    : never;
};

export type RemapByStage<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `stage:${K}` : never]: T[K];
};

export type InputFor<TChain extends readonly PluginDefinition[]> =
  TChain extends readonly [infer Head extends PluginDefinition, ...any]
    ? PluginDefinitionInput<Head>
    : never;

export type OutputFor<TChain extends readonly PluginDefinition[]> =
  TChain extends readonly [...any[], infer Tail]
    ? Tail extends PluginDefinition<any, infer O, any, any>
      ? O
      : never
    : never;

export type ChainStepTuple<TChain extends readonly PluginDefinition[]> = TupleUnroll<{
  [K in keyof TChain]: PluginDefinitionInput<TChain[K]>;
}>;

export interface WorkflowEnvelope<TStage extends WorkflowStage, TPayload extends object> {
  readonly runId: WorkflowRunId;
  readonly stage: TStage;
  readonly namespace: PluginNamespace;
  readonly tags: readonly string[];
  readonly payload: TPayload;
}

export interface WorkflowContext<TInput> {
  readonly runId: WorkflowRunId;
  readonly tenantId: string;
  readonly stage: WorkflowStage;
  readonly namespace: PluginNamespace;
  readonly input: TInput;
}

export type WorkflowOutput<TInput> = {
  readonly stage: WorkflowStage;
  readonly runId: WorkflowRunId;
  readonly value: TInput;
};

export interface WorkflowManifest {
  readonly namespace: PluginNamespace;
  readonly build: string;
  readonly stages: readonly WorkflowStage[];
  readonly pluginIds: readonly PluginId[];
}

export interface WorkflowTrace {
  readonly stage: StageEventName<WorkflowStage>;
  readonly at: string;
  readonly pluginId: PluginId;
  readonly ok: boolean;
}

export type CompatibleStep<TChain extends readonly PluginDefinition[]> = CompatibleChain<TChain> & readonly PluginDefinition[];

export interface WorkflowChainRuntime<TChain extends readonly PluginDefinition[]> {
  readonly id: WorkflowRunId;
  readonly namespace: PluginNamespace;
  readonly chain: CompatibleStep<TChain>;
}

const defaultNamespace = canonicalizeNamespace('recovery:stress:lab');
const buildRunId = (namespace: PluginNamespace, seed: string): WorkflowRunId => `${namespace}::${seed}::run` as WorkflowRunId;

export const createWorkflowRunId = (tenantId: string, salt: string): WorkflowRunId =>
  buildRunId(defaultNamespace, `${tenantId}-${salt}`);

const isReadableRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeChain = <T extends readonly PluginDefinition[]>(chain: T): T =>
  [...collectIterable(chain)] as unknown as T;

const eventDigest = (trace: WorkflowTrace): string => `${trace.at}|${trace.stage}|${String(trace.ok)}`;

export const describeChain = <TChain extends readonly PluginDefinition[]>(chain: TChain): WorkflowManifest => {
  const normalized = normalizeChain(chain);
  const pluginIds = collectIterable(normalized.map((entry) => entry.id));
  const rawStages = pluginIds.map((entry) => {
    const value = String(entry);
    return (value.includes('plan')
      ? 'plan'
      : value.includes('shape')
        ? 'shape'
        : value.includes('simulate')
          ? 'simulate'
          : value.includes('recommend')
            ? 'recommend'
            : value.includes('report')
              ? 'report'
              : 'input') as WorkflowStage;
  });

  return {
    namespace: defaultNamespace,
    build: `${normalized.length}-${rawStages.length}`,
    stages: [...rawStages],
    pluginIds,
  };
};

export const buildWorkflowContext = <TInput>(
  runId: WorkflowRunId,
  tenantId: string,
  stage: WorkflowStage,
  input: NoInfer<TInput>,
): WorkflowContext<TInput> => ({
  runId,
  tenantId,
  stage,
  namespace: defaultNamespace,
  input: isReadableRecord(input) ? (input as TInput) : ({} as TInput),
});

export const createWorkflowOutput = <TInput>(runId: WorkflowRunId, stage: WorkflowStage, value: TInput): WorkflowOutput<TInput> => ({
  stage,
  runId,
  value,
});

export const collectWorkflowTrace = async <TChain extends readonly PluginDefinition[]>(
  runId: WorkflowRunId,
  pluginIds: readonly PluginId[],
  stage: WorkflowStage,
  records: Iterable<{ pluginId: PluginId; ok: boolean }>,
): Promise<readonly WorkflowTrace[]> => {
  const source = Array.from(records);
  const traces = source.map((entry, index) => ({
    stage: `${stage}:event:trace` as StageEventName<WorkflowStage>,
    at: new Date(Date.now() + index * 13).toISOString(),
    pluginId: entry.pluginId,
    ok: entry.ok,
  }));

  const merged = mapIterable(pluginIds, (pluginId, index) => ({
    stage: `${stage}:event:${pluginId}` as StageEventName<WorkflowStage>,
    at: new Date(Date.now() + traces.length * 7 + index).toISOString(),
    pluginId,
    ok: Boolean(traces[index]?.ok),
  }));

  return [...collectIterable(traces), ...collectIterable(merged)];
};

export const buildWorkflowDigest = async (runId: WorkflowRunId, traces: Iterable<WorkflowTrace>): Promise<string> => {
  const signature = await Promise.all(Array.from(mapIterable(traces, (trace) => Promise.resolve(eventDigest(trace)))));
  return `${runId}::${signature.join('|')}`;
};

export const normalizeChainWithZ = <TChain extends readonly PluginDefinition[]>(
  chain: CompatibleChain<TChain> & readonly PluginDefinition[],
): ChainStepTuple<TChain> => [...chain] as unknown as ChainStepTuple<TChain>;

export const mapChainStages = <TInput, TOutput>(
  stage: WorkflowStage,
  chain: readonly PluginDefinition[],
  input: NoInfer<TInput>,
): OutputFor<readonly PluginDefinition[]> & TInput => {
  const inputTypeTag = stage.length + String(chain.length);
  return {
    ...((isReadableRecord(input) ? input : {}) as TInput),
    chain: chain.map((entry) => ({
      id: entry.id,
      tags: [...entry.tags],
      stage: inputTypeTag,
    } as unknown)),
  } as OutputFor<readonly PluginDefinition[]> & TInput;
};

export const toRemappedManifest = <T extends Record<string, unknown>>(payload: T): RemapByStage<T> => {
  const transformed = new Map<string, unknown>();
  for (const [key, value] of Object.entries(payload)) {
    transformed.set(`stage:${key}`, value);
  }
  return Object.fromEntries(transformed) as RemapByStage<T>;
};

export type WorkspaceTagKind<T extends PluginKind> = {
  readonly kind: T;
};

export type PluginByKind<TKind extends PluginKind> = PluginDefinition<any, any, any, TKind>;
