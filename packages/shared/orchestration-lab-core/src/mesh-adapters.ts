import { mapIterable, iteratorFrom, toArray } from './iterators';
import { canonicalizeNamespace, type PluginDefinition, type PluginId, type PluginDependency, type PluginKind, createPluginId } from '@shared/stress-lab-runtime';
import {
  MeshLane,
  MeshMode,
  MeshConstraint,
  MeshRunId,
  MeshRunEnvelope,
  MeshRuntimeContext,
  MeshRuntimeEvent,
  MeshPath,
  MeshKind,
} from './mesh-types';

export type AdapterInput = Record<string, unknown> & { readonly runId?: MeshRunId };
export type AdapterOutput = Record<string, unknown> & { readonly runId: MeshRunId };

export interface MeshAdapter<TInput extends AdapterInput = AdapterInput, TOutput extends AdapterOutput = AdapterOutput> {
  readonly id: PluginId;
  readonly name: string;
  readonly lane: MeshLane;
  readonly tags: readonly string[];
  readonly dependencies: readonly PluginDependency[];
  readonly run: (input: TInput, context: MeshRuntimeContext) => Promise<TOutput>;
}

export interface MeshAdapterChainState {
  readonly step: number;
  readonly total: number;
  readonly pluginIds: readonly PluginId[];
  readonly startedAt: string;
  readonly events: readonly MeshRuntimeEvent[];
}

export interface MeshAdapterChainResult {
  readonly ok: boolean;
  readonly output: AdapterOutput;
  readonly state: MeshAdapterChainState;
  readonly errors: readonly string[];
}

export const defineAdapter = <
  const TInput extends AdapterInput,
  const TOutput extends AdapterOutput,
  const TName extends string,
  const TLane extends MeshLane,
>(
  name: TName,
  lane: TLane,
  run: (input: TInput, context: MeshRuntimeContext) => Promise<TOutput>,
): MeshAdapter<TInput, TOutput> => {
  const namespace = canonicalizeNamespace(`mesh-${lane}`);
  return {
    id: createPluginId(namespace, `mesh/${lane}` as PluginKind, name),
    name,
    lane,
    tags: [lane, name],
    dependencies: [],
    async run(input, context) {
      const value = await run(input as TInput, context);
      return {
        ...value,
        runId: value.runId ?? (context.runId as MeshRunId),
      };
    },
  };
};

const emitEvent = (
  route: MeshPath<readonly [MeshKind, string, MeshMode]>,
  pluginName: string,
  value: number,
  labels: readonly string[],
): MeshRuntimeEvent => ({
  kind: `${route}.throughput` as MeshRuntimeEvent['kind'],
  value,
  at: new Date().toISOString(),
  tags: ['mesh', pluginName, ...labels],
});

export const routeFromEnvelope = (envelope: MeshRunEnvelope): MeshPath<readonly [MeshKind, string, MeshMode]> =>
  envelope.route;

export const runAdapterChain = async <
  const TInput extends AdapterInput,
  const TChain extends readonly MeshAdapter[],
>(
  chain: TChain,
  input: TInput,
  context: MeshRuntimeContext,
): Promise<MeshAdapterChainResult> => {
  const startedAt = new Date().toISOString();
  const route = routeFromEnvelope(buildEnvelope(context.runId, context.meshLane, context.meshMode));
  const events: MeshRuntimeEvent[] = [];

  let current = { ...input } as AdapterInput;
  let step = 0;
  const pluginIds: PluginId[] = [];

  try {
    const normalized = iteratorFrom(chain);
    const ordered = [...mapIterable(normalized, (entry) => entry)] as TChain;
    for (const adapter of ordered) {
      step += 1;
      pluginIds.push(adapter.id);
      const output = await adapter.run(current as AdapterInput, context);
      current = output as AdapterInput;
      events.push(emitEvent(route, adapter.name, 1, ['ok', `step:${step}`]));
    }

    return {
      ok: true,
      output: current as AdapterOutput,
      state: {
        step,
        total: ordered.length,
        pluginIds,
        startedAt,
        events,
      },
      errors: [],
    };
  } catch (error) {
    events.push(emitEvent(route, 'adapter-chain', 0, ['error', `step:${step}`]));
    return {
      ok: false,
      output: { ...current, runId: context.runId } as AdapterOutput,
      state: {
        step,
        total: chain.length,
        pluginIds,
        startedAt,
        events,
      },
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
};

export const toPluginAdapters = <
  const TPlugins extends readonly PluginDefinition[],
>(
  namespace: string,
  lane: MeshLane,
  plugins: TPlugins,
): readonly MeshAdapter[] => {
  const resolved = plugins.toSorted((left, right) => left.name.localeCompare(right.name));
  return resolved.map((plugin) => ({
    id: createPluginId(canonicalizeNamespace(namespace), `mesh/${lane}` as PluginKind, plugin.name),
    name: plugin.name,
    lane,
    tags: [lane, plugin.id],
    dependencies: plugin.dependencies,
    async run(input, context) {
      return {
        ...input,
        ...(plugin.run ? await plugin.run(context, input).then((result) => ({
          pluginResult: {
            ok: result.ok,
            value: result.value,
            generatedAt: result.generatedAt,
          },
        })) : {}),
        runId: context.runId,
      } as AdapterOutput;
    },
  }));
};

export const runAdaptersInParallel = async (
  adapters: readonly MeshAdapter[],
  input: AdapterInput,
  context: MeshRuntimeContext,
): Promise<readonly MeshAdapterChainResult[]> => {
  const tasks = adapters.map((adapter) => adapter.run(input, context).then<
    MeshAdapterChainResult,
    { ok: boolean; state: MeshAdapterChainState; output: AdapterOutput; errors: readonly string[] }
  >((value) => ({
    ok: true,
    output: value,
    state: {
      step: 1,
      total: 1,
      pluginIds: [adapter.id],
      startedAt: new Date().toISOString(),
      events: [emitEvent(routeFromEnvelope(buildEnvelope(context.runId, context.meshLane, context.meshMode)), adapter.name, 1, ['parallel'])],
    },
    errors: [],
  })));

  return Promise.all(
    tasks.map(async (task) => {
      try {
        return await task;
      } catch (error) {
        return {
          ok: false,
          output: { ...(input as AdapterOutput), runId: context.runId },
          state: {
            step: 1,
            total: 1,
            pluginIds: [],
            startedAt: new Date().toISOString(),
            events: [
              emitEvent(
                routeFromEnvelope(buildEnvelope(context.runId, context.meshLane, context.meshMode)),
                'parallel',
                0,
                ['failed'],
              ),
            ],
          },
          errors: [error instanceof Error ? error.message : String(error)],
        };
      }
    }),
  );
};

export const asTuples = <T extends readonly MeshAdapter[]>(adapters: T): readonly (readonly [PluginId, MeshAdapter])[] =>
  adapters.map((adapter): [PluginId, MeshAdapter] => [adapter.id, adapter]);

export const summarizeAdapterChain = (result: MeshAdapterChainResult): string => {
  const pluginCount = result.state.pluginIds.length;
  const status = result.ok ? 'ok' : 'error';
  const eventCount = result.state.events.length;
  return `mesh-adapter:${status}:steps=${result.state.step}:${pluginCount}:events=${eventCount}`;
};

export const toAdapterPayload = (result: MeshAdapterChainResult): MeshRuntimeEvent[] => {
  const payload = Object.entries(result.output);
  const countEvent: MeshRuntimeEvent = {
    kind: 'mesh.signal.throughput',
    value: payload.length,
    at: new Date().toISOString(),
    tags: ['adapter-summary', String(result.ok)],
  };
  return [countEvent, ...result.state.events];
};

export const normalizeAdapterChain = (adapters: readonly MeshAdapter[]): readonly MeshAdapter[] => {
  return [...adapters]
    .filter((adapter) => adapter.dependencies.every((dependency) => dependency.startsWith('dep:')))
    .toSorted((left, right) => left.name.localeCompare(right.name));
};

export const collectAdapterOutput = (
  result: MeshAdapterChainResult,
  adapters: readonly MeshAdapter[],
): readonly AdapterOutput[] => {
  const mapping = new Map<PluginId, MeshAdapter>(adapters.map((adapter) => [adapter.id, adapter]));
  return toArray(
    mapIterable(result.state.pluginIds, (pluginId) => {
      const adapter = mapping.get(pluginId);
      return {
        ...result.output,
        adapterName: adapter?.name ?? pluginId,
      } as AdapterOutput;
    }),
  );
};

export const buildEnvelope = (
  runId: MeshRunId,
  lane: MeshLane,
  mode: MeshMode,
): MeshRunEnvelope => ({
  runId,
  tenantId: runId as any,
  mode,
  route: `mesh/${lane}/${mode}` as MeshPath<readonly [MeshKind, string, MeshMode]>,
  startedAt: new Date().toISOString(),
  constraints: [] as readonly MeshConstraint[],
});

export const projectAdapterErrors = (results: readonly MeshAdapterChainResult[]): readonly string[] =>
  results.flatMap((result) => (result.ok ? [] : result.errors));
