import {
  pluginDefinition,
  type PluginDefinition,
  type PluginId,
} from '@shared/cascade-orchestration-kernel';
import type { TenantId } from './blueprints.js';

export const makeIngestPlugin = <T extends Record<string, unknown>>() => {
  const id = `ingest-core:${Date.now()}` as PluginId<'input'>;
  const scope = 'input' as const;
  const stage = 'input' as const;
  const spec = {
    id,
    name: 'cascade.ingest',
    scope,
    stage,
    capabilities: ['capability:normalize', 'capability:validate'] as const,
    run: (ctx: Parameters<PluginDefinition['run']>[0]) => {
      const input = ctx.input as TenantId & T;
      return {
        pluginId: id,
        scope,
        output: {
          accepted: true,
          source: 'ingest',
          context: input,
        },
        latencyMs: 1,
      };
    },
  };
  return pluginDefinition(spec);
};

export const makeAssemblePlugin = <T extends { edges: unknown[] }>() => {
  const id = `assemble-core:${Date.now()}` as PluginId<'transform'>;
  const scope = 'transform' as const;
  const stage = 'transform' as const;
  const spec = {
    id,
    name: 'cascade.assemble',
    scope,
    stage,
    capabilities: ['capability:compose', 'capability:plan'] as const,
    run: (ctx: Parameters<PluginDefinition['run']>[0]) => {
      const payload = ctx.input as T;
      return {
        pluginId: id,
        scope,
        output: {
          built: true,
          graphSize: payload?.edges?.length ?? 0,
          metadata: { runId: ctx.runId },
        },
        latencyMs: 1,
      };
    },
  };
  return pluginDefinition(spec);
};

export const makeObservePlugin = () => {
  const id = `observe-core:${Date.now()}` as PluginId<'observe'>;
  const scope = 'observe' as const;
  const stage = 'observe' as const;
  const spec = {
    id,
    name: 'cascade.observe',
    scope,
    stage,
    capabilities: ['capability:telemetry', 'capability:alert'] as const,
    run: (ctx: Parameters<PluginDefinition['run']>[0]) => {
      const output = {
        observed: true,
        snapshot: {
          pluginCount: typeof ctx.state === 'object' ? Object.keys(ctx.state as never).length : 0,
        },
      };
      return {
        pluginId: id,
        scope,
        output,
        latencyMs: 1,
      };
    },
  };
  return pluginDefinition(spec);
};

export type DefaultPlugins = readonly [
  ReturnType<typeof makeIngestPlugin>,
  ReturnType<typeof makeAssemblePlugin>,
  ReturnType<typeof makeObservePlugin>,
];

export const defaultPlugins: DefaultPlugins = [
  makeIngestPlugin<Record<string, unknown>>(),
  makeAssemblePlugin<{ edges: string[] }>(),
  makeObservePlugin(),
];

export const pluginByName = <
  TPlugins extends readonly PluginDefinition[],
  TName extends TPlugins[number]['name'],
>(plugins: TPlugins, name: TName): TPlugins[number] | undefined =>
  plugins.find((candidate) => candidate.name === name);
