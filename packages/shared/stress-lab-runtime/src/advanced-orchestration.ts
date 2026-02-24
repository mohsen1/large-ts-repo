import {
  type PluginContext,
  type PluginDefinition,
  type PluginId,
  type PluginResult,
  runPluginWithSafeEnvelope,
} from './plugin-registry';
import { collectIterable, mapIterable, zipLongest } from './iterator-utils';
import { withAsyncPluginScope } from './lifecycle';
import {
  canonicalizeNamespace,
  createPluginId,
  buildPluginVersion,
  type PluginDependency,
  type PluginKind,
  type PluginNamespace,
} from './ids';
import {
  createWorkflowRunId,
  type WorkflowContext,
  type WorkflowOutput,
  type WorkflowStage,
  type StageEventName,
  type WorkflowTrace,
  type WorkflowManifest,
  type WorkflowRunId,
  buildWorkflowContext,
  createWorkflowOutput,
  collectWorkflowTrace,
  buildWorkflowDigest,
  describeChain,
} from './advanced-types';

export interface OrchestratedStageInput<TPayload> {
  readonly namespace: PluginNamespace;
  readonly payload: TPayload;
  readonly stage: WorkflowStage;
  readonly tenantId: string;
}

export interface OrchestratedStageOutput<TPayload> {
  readonly stage: WorkflowStage;
  readonly value: TPayload;
  readonly manifest: WorkflowManifest;
  readonly traceDigest: string;
}

export interface StageResult<TInput, TOutput> {
  readonly ok: boolean;
  readonly plugin: PluginId;
  readonly input: TInput;
  readonly output: TOutput;
}

class StageScope {
  readonly #stack = new AsyncDisposableStack();
  #closed = false;

  constructor(readonly runId: WorkflowRunId) {}

  get id(): WorkflowRunId {
    return this.runId;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return this.#stack.disposeAsync();
  }

  [Symbol.dispose](): void {
    this.#closed = true;
  }
}

const fallbackTag = (runId: WorkflowRunId, pluginId: PluginId) => `${runId}:${String(pluginId)}`;

export const executeSinglePlugin = async <TInput, TOutput, TContext extends object>(
  plugin: PluginDefinition<TInput, TOutput, TContext>,
  context: PluginContext<TContext>,
  input: TInput,
): Promise<PluginResult<TOutput>> => {
  if (plugin.tags.includes('disabled')) {
    return {
      ok: false,
      errors: ['plugin disabled by static tag'],
      generatedAt: new Date().toISOString(),
    };
  }

  return runPluginWithSafeEnvelope(plugin, context, input);
};

export const executeChainStages = async <TInput, TOutput>(
  tenantId: string,
  stage: WorkflowStage,
  chain: readonly PluginDefinition<any, any, Record<string, unknown>, PluginKind>[],
  input: TInput,
): Promise<OrchestratedStageOutput<TInput>> => {
  const runId = createWorkflowRunId(tenantId, `${stage}-${chain.length}`);
  const context = buildWorkflowContext(runId, tenantId, stage, input);
  const namespace = canonicalizeNamespace('recovery:stress:lab');
  const pluginIds: PluginId[] = collectIterable(mapIterable(chain, (plugin) => plugin.id));

  const traces: WorkflowTrace[] = [];
  const manifest = describeChain(chain);

  const pipeline = mapIterable(chain, (plugin, index) => ({
    plugin,
    index,
    context,
    value: input,
  }));

  const records = mapIterable(pipeline, (entry) => {
    return {
      pluginId: entry.plugin.id,
      ok: Boolean(entry.plugin.id) && (entry.index % 2 === 0 || !entry.plugin.tags.includes('force-fail')),
      output: entry.value,
    };
  });

  const outputs = collectIterable(mapIterable(records, ({ pluginId, ok, output }) => {
    traces.push({
      stage: `${stage}:event:${pluginId}` as StageEventName<WorkflowStage>,
      at: new Date(Date.now() + (ok ? 0 : 1)).toISOString(),
      pluginId,
      ok,
    });
    const safeOutput = {
      ok,
      plugin: pluginId,
      input,
      output: output as unknown as TOutput,
    } as StageResult<TInput, TOutput>;
    return safeOutput;
  }));

  const _traces = await collectWorkflowTrace(runId, pluginIds, stage, traces);

  const payloadDigest = await buildWorkflowDigest(runId, traces);
  const output = createWorkflowOutput(runId, stage, outputs[0]?.output ?? input);

  const pluginTags: PluginDefinition<any, any, Record<string, unknown>, PluginKind> = {
    id: createPluginId(namespace, 'stress-lab/runtime', `${stage}-summary`),
    name: `${tenantId}-${stage}-summary`,
    namespace,
    kind: 'stress-lab/runtime',
    version: buildPluginVersion(1, 0, 0),
    tags: [fallbackTag(runId, pluginIds[0] ?? (createPluginId(namespace, 'stress-lab/runtime', `${stage}-empty`) as PluginId))],
    dependencies: ['dep:recovery:stress:lab'] as readonly PluginDependency[],
    config: { tenantId, stage, namespace, pluginCount: pluginIds.length },
    run: async (
      _context: PluginContext<Record<string, unknown>>,
      _payload: unknown,
    ): Promise<PluginResult<unknown>> => ({
      ok: true,
      value: { outputCount: outputs.length, outputDigest: payloadDigest },
      generatedAt: new Date().toISOString(),
    }),
  };

  const stageEvent = {
      stage,
      value: output.value as TInput,
      manifest,
      traceDigest: `${payloadDigest}|${pluginTags.kind}`,
    };

  return stageEvent;
};

export const executeStudioWorkflow = async <TInput>(
  tenantId: string,
  stage: WorkflowStage,
  chain: readonly PluginDefinition<any, any, Record<string, unknown>>[],
  input: TInput,
): Promise<OrchestratedStageOutput<TInput>> => {
  const result = await withAsyncPluginScope(
    {
      tenantId,
      namespace: canonicalizeNamespace('recovery:stress:lab'),
      requestId: `${tenantId}:${stage}:${Date.now()}`,
      startedAt: new Date().toISOString(),
    },
      async () => {
        return executeChainStages(tenantId, stage, chain, input);
      },
    );

  await using scope = new StageScope(createWorkflowRunId(tenantId, stage));
  return result;
};

export const buildFallbackPluginDefinition = <TInput, TOutput>(
  name: string,
  kind: PluginKind,
  namespace: PluginNamespace,
  run: (context: PluginContext<Record<string, unknown>>, input: TInput) => Promise<PluginResult<TOutput>>,
): PluginDefinition<TInput, TOutput, Record<string, unknown>> => {
  const pluginNamespace = namespace || canonicalizeNamespace('recovery:stress:lab');
  const id = createPluginId(pluginNamespace, kind, name);

  return {
    id,
    name,
    namespace: pluginNamespace,
    kind,
    version: buildPluginVersion(1, 0, 0),
    tags: ['runtime', 'auto'],
    dependencies: ['dep:recovery:stress:lab'],
    config: {
      pluginKind: kind,
      auto: true,
    },
    run,
  };
};

export const bootstrapStudioPluginChain = async (tenantId: string): Promise<readonly PluginDefinition<any, any, Record<string, unknown>>[]> => {
  const namespace = canonicalizeNamespace('recovery:stress:lab');
  const context = buildWorkflowContext(createWorkflowRunId(tenantId, 'bootstrap'), tenantId, 'input', {
    bootstrap: true,
  });

  const chain = [
    buildFallbackPluginDefinition(
      `${tenantId}:normalize`,
      'stress-lab/runtime',
      namespace,
      async (_context, input: Record<string, string>) => ({
        ok: true,
        value: { ...input, preparedAt: new Date().toISOString() },
        generatedAt: new Date().toISOString(),
      }),
    ),
    buildFallbackPluginDefinition(
      `${tenantId}:dispatch`,
      'stress-lab/dispatch',
      namespace,
      async (_context, input: Record<string, string>) => ({
        ok: true,
        value: { ...input, dispatchedAt: new Date().toISOString() },
        generatedAt: new Date().toISOString(),
      }),
    ),
  ];

  const traceInput = zipLongest(chain, [context.stage, 'completed']);
  const stageRecords = collectIterable(traceInput);
  void stageRecords;

  return chain;
};
