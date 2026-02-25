import {
  type PluginName,
  type PluginResult,
  type PluginSessionOptions,
  type PluginTrace,
  type PluginStepInput,
  type Registry,
  type RegistryPlugin,
  createPluginSession,
} from '@shared/type-level';
import { MeshChannel, MeshRoute, MeshRunId } from './types.js';

export type RuntimePluginName<T extends string = string> = PluginName<T>;

export interface RuntimePluginInput<TInput> {
  readonly route: MeshRoute;
  readonly runId: MeshRunId;
  readonly payload: TInput;
}

export interface RuntimePluginOutput<TOutput> {
  readonly route: MeshRoute;
  readonly channels: readonly MeshChannel[];
  readonly output: TOutput;
  readonly confidence: number;
}

export interface RuntimePlugin<TName extends string, TInput, TOutput>
  extends RegistryPlugin<TName, TInput, RuntimePluginOutput<TOutput>, RuntimePluginName<TName>> {
  readonly zone: string;
  canProcess(input: TInput, trace: PluginTrace): boolean;
  process(input: PluginStepInput<TInput>, trace: PluginTrace): Promise<PluginResult<RuntimePluginOutput<TOutput>>>;
}

export interface PluginRuntimePlan<TPlugins extends readonly RuntimePlugin<string, unknown, unknown>[]> {
  readonly name: string;
  readonly plugins: Registry<TPlugins>;
  readonly trace: PluginTrace;
}

export const createRuntimePlan = <TPlugins extends readonly RuntimePlugin<string, unknown, unknown>[]>(
  plugins: TPlugins,
  options: PluginSessionOptions,
): PluginRuntimePlan<TPlugins> => {
  const trace: PluginTrace = {
    namespace: options.name,
    correlationId: `${options.name}-${Date.now()}` as any,
    startedAt: Date.now(),
    metadata: { capacity: options.capacity },
  };

  const session = createPluginSession(plugins, {
    name: options.name,
    capacity: options.capacity,
  });

  return {
    name: options.name,
    plugins: session.registry,
    trace,
  };
};

export const executeRuntimePlan = async <
  TPlugins extends readonly RuntimePlugin<string, unknown, unknown>[],
  TInput,
>(
  plan: PluginRuntimePlan<TPlugins>,
  input: TInput,
): Promise<PluginResult<readonly PluginResult<RuntimePluginOutput<unknown>>[]>> => {
  const results: PluginResult<RuntimePluginOutput<unknown>>[] = [];

  for (const plugin of plan.plugins) {
    const trace: PluginTrace = {
      namespace: plan.name,
      correlationId: `${plan.trace.correlationId}#${plugin.name}` as any,
      startedAt: Date.now(),
      metadata: {
        plugin: plugin.name,
        supports: plugin.supports.join(','),
      },
    };

    if (!plugin.canProcess(input, trace)) {
      continue;
    }

    const output = await plugin.process(
      {
        kind: 'mesh-step',
        phase: 'analysis',
        createdAt: new Date(),
        payload: input,
        tags: ['runtime', ...plugin.supports],
      },
      trace,
    );

    if (output.status === 'error') {
      return {
        status: 'error',
        reason: output.reason,
        error: output.error,
      };
    }

    results.push(output);
  }

  return {
    status: 'ok',
    payload: results,
  };
};
