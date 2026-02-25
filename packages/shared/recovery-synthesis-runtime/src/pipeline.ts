import { mapIterable } from './iterator-tools';
import { createAsyncDisposableStack } from './disposables';
import type {
  PluginDefinition,
  PluginNameUnion,
  PluginContext,
  PipelineMode,
  PluginOutput,
  SynthesisPluginName,
  SynthesisTelemetryFrame,
  SynthesisTraceId,
  StageName,
} from './types';
import { SynthesisPluginRegistry, type RegistryProbe } from './registry';

export type StageChain<TInput, TOutput> = (input: TInput, context: PluginContext<TInput>) => Promise<TOutput>;

export interface PipelineRequest<TInput = unknown> {
  readonly traceId: SynthesisTraceId;
  readonly mode: PipelineMode;
  readonly metadata: Readonly<Record<string, string>>;
  readonly input: TInput;
}

export interface PipelineReport<TOutput = unknown, TInput = unknown> {
  readonly request: PipelineRequest<TInput>;
  readonly output: TOutput;
  readonly timeline: readonly SynthesisTelemetryFrame<unknown>[];
  readonly probes: readonly RegistryProbe<TInput>[];
}

export const createPipelineContext = <TInput>(
  request: PipelineRequest<TInput>,
  stage: StageName,
  sequence: number,
): PluginContext<TInput> => ({
  traceId: request.traceId,
  plugin: 'plugin:none' as SynthesisPluginName,
  stage,
  sequence,
  startedAt: new Date().toISOString(),
  input: request.input,
  metadata: request.metadata as Record<`cfg:${string}`, string>,
});

export async function executePipeline<TInput, TOutput, TPlugins extends readonly PluginDefinition[]>(
  request: PipelineRequest<TInput>,
  registry: SynthesisPluginRegistry<TPlugins>,
  entry: SynthesisPluginName,
): Promise<PipelineReport<TOutput, TInput>> {
  const order = registry.ordered();
  const startIndex = order.findIndex((name) => name === entry);
  const timeline: SynthesisTelemetryFrame<unknown>[] = [];
  const probes: RegistryProbe<TInput>[] = [];
  let payload = request.input as TInput;

  using stack = createAsyncDisposableStack();

  const active = startIndex < 0 ? [] : order.slice(startIndex);
  for (const [index, pluginName] of active.entries()) {
    const context = createPipelineContext(request, `stage:${pluginName.slice('plugin:'.length)}` as StageName, index);
    const result = await registry.execute(
      pluginName as PluginNameUnion<TPlugins>,
      payload,
      {
        ...context,
        traceId: request.traceId,
      } as Omit<PluginContext<TInput>, 'input' | 'plugin'>,
    );

    timeline.push({
      id: request.traceId,
      at: new Date().toISOString(),
      stage: context.stage,
      plugin: pluginName,
      payload: result.payload,
      latencyMs: result.latencyMs,
    });

    if (request.mode === 'shadow') {
      probes.push({
        input: request.input,
        diagnostics: [
          `plugin=${pluginName}`,
          `status=${result.status}`,
          `artifacts=${result.artifacts.length}`,
        ],
      } as RegistryProbe<TInput>);
    }

    payload = result.payload as unknown as TInput;
    stack.use(result as PluginOutput<unknown>);
  }

    return {
    request,
    output: payload as unknown as TOutput,
    timeline,
    probes,
  };
}

export async function executeTypedPipeline<TInput, TOutput>(
  request: PipelineRequest<TInput>,
  transforms: readonly StageChain<TInput, TOutput>[],
  seed: TInput,
): Promise<PipelineReport<TOutput, TInput>> {
  const timeline: SynthesisTelemetryFrame<unknown>[] = [];
  const stack = createAsyncDisposableStack();
  const probes: RegistryProbe<TInput>[] = [
    {
      input: request.input,
      diagnostics: [`mode=${request.mode}`, `transforms=${transforms.length}`],
    } as RegistryProbe<TInput>,
  ];

  try {
    let output: TOutput = seed as unknown as TOutput;
    for (const [index, transform] of transforms.entries()) {
      output = await transform(
        seed,
        createPipelineContext(request, `stage:transform:${index}` as StageName, index),
      );
      timeline.push({
        id: request.traceId,
        at: new Date().toISOString(),
        stage: `stage:transform:${index}` as StageName,
        plugin: 'plugin:transform' as SynthesisPluginName,
        payload: output,
        latencyMs: 0,
      });
      seed = output as unknown as TInput;
    }

    return {
      request,
      output,
      timeline,
      probes,
    };
  } finally {
    await stack[Symbol.asyncDispose]();
  }
}

export function executeIntoPairs<TInput, TOutput, TPlugins extends readonly PluginDefinition[]>(
  request: PipelineRequest<TInput>,
  registry: SynthesisPluginRegistry<TPlugins>,
  entry: SynthesisPluginName,
): Promise<PipelineReport<TOutput, TInput>> {
  return executePipeline<TInput, TOutput, TPlugins>(request, registry, entry);
}

export function pluginPairs<TPlugins extends readonly PluginDefinition[]>(
  registry: SynthesisPluginRegistry<TPlugins>,
): readonly [SynthesisPluginName, readonly SynthesisPluginName[]][] {
  return [...mapIterable(registry.dependencyGraph(), (entry) => entry)] as readonly [
    SynthesisPluginName,
    readonly SynthesisPluginName[],
  ][];
}
