import {
  buildPluginId,
  buildPluginVersion,
  canonicalizeNamespace,
  PluginDefinition,
  PluginExecutionRecord,
  PluginKind,
  PluginRegistry,
  PluginSession,
  PluginSessionConfig,
  type PluginContext,
  type PluginEventName,
  type PluginId,
  type PluginNamespace,
  type PluginTag,
  withAsyncPluginScope,
  withPluginScope,
  buildPluginResult,
  PluginResult,
  runPluginWithSafeEnvelope,
} from '@shared/stress-lab-runtime';
import {
  createTenantId,
  OrchestrationPlan,
  RecoverySignal,
  RecoverySimulationResult,
  StressRunState,
  TenantId,
  WorkloadTarget,
} from './models';
import { type Brand } from '@shared/core';

const namespace = canonicalizeNamespace('recovery:stress:studio');

export type StudioPluginName = `${string}:${string}`;
export type StudioPluginId = PluginId;
export type StudioPluginKind = PluginKind | `stress-lab/insights` | `stress-lab/analysis`;

export type PluginEnvelope<TInput, TOutput> = {
  readonly plugin: PluginDefinition<TInput, TOutput, Record<string, unknown>, StudioPluginKind>;
  readonly metadata: {
    readonly confidence: number;
    readonly latencyMs: number;
    readonly canRetry: boolean;
  };
};

export type StudioWorkspaceState = Readonly<{
  tenantId: TenantId;
  runState: StressRunState;
  topologies: readonly WorkloadTarget[];
  signals: readonly RecoverySignal[];
  plan: OrchestrationPlan | null;
  simulation: RecoverySimulationResult | null;
}>;

export type PluginEvent = {
  readonly name: PluginEventName;
  readonly pluginId: StudioPluginId;
  readonly at: string;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type PluginManifestRecord = Readonly<{
  readonly id: string;
  readonly namespace: string;
  readonly kind: StudioPluginKind;
  readonly version: `${number}.${number}.${number}`;
  readonly tags: readonly string[];
}>;

export type PluginRecordByKind<TCatalog extends Record<string, PluginDefinition<any, any, any, PluginKind>>> = {
  [K in keyof TCatalog as TCatalog[K] extends PluginDefinition<any, any, any, infer TKind>
    ? TKind extends string
      ? `kind:${TKind}`
      : never
    : never]: PluginEnvelope<PluginDefinitionInput<TCatalog[K]>, PluginDefinitionOutput<TCatalog[K]>>;
};

export type PluginDefinitionInput<T> = T extends PluginDefinition<infer I, any, any, any> ? I : never;
export type PluginDefinitionOutput<T> = T extends PluginDefinition<any, infer O, any, any> ? O : never;

export type RegistryEntry<TInput, TOutput> = {
  readonly pluginId: StudioPluginId;
  readonly namespace: PluginNamespace;
  readonly kind: StudioPluginKind;
  readonly outputBrand: Brand<string, 'RuntimeOutput'>;
  readonly input: TInput;
  readonly output: TOutput;
};

const toEventName = (pluginId: StudioPluginName, stage: 'pre' | 'post'): PluginEventName =>
  `stress-lab/${stage === 'pre' ? 'pre' : 'post'}:${pluginId}` as PluginEventName;

export const studioPluginTag = (tenantId: TenantId): PluginTag => ({
  namespace,
  kind: `stress-lab/${tenantId}` as StudioPluginKind,
  version: buildPluginVersion(1, 0, 0),
});

export const createPluginSessionConfig = (
  tenantId: TenantId,
  namespace: PluginNamespace,
  requestId: string,
): PluginSessionConfig => ({
  tenantId,
  namespace,
  requestId,
  startedAt: new Date().toISOString(),
});

const pluginDependencies = ['dep:stress-studio-runtime', 'dep:domain-core', 'dep:shared-runtime'] as const;

const createStudioPluginDefinition = (kind: StudioPluginKind, name: string): PluginDefinition<Record<string, unknown>, { readonly accepted: boolean }, Record<string, unknown>, StudioPluginKind> => ({
  id: buildPluginId(namespace, kind as PluginKind, `${name}-plugin`) as StudioPluginId,
  name,
  namespace,
  kind,
  version: buildPluginVersion(1, 0, 1),
  tags: [`kind:${kind}`, `tenant-bound`],
  dependencies: pluginDependencies,
  config: { name, createdAt: new Date().toISOString() },
  run: async () => {
    return buildPluginResult({ accepted: true });
  },
});

export const buildStudioCatalog = (tenantId: TenantId): readonly PluginDefinition<any, any>[] => {
  const sessionNamespace = createPluginSessionConfig(
    tenantId,
    canonicalizeNamespace('recovery:stress:lab'),
    `${tenantId}:catalog`,
  ).namespace;
  const kinds = [
    'stress-lab/input-validator',
    'stress-lab/topology-builder',
    'stress-lab/runbook-optimizer',
    'stress-lab/signal-sanitizer',
    'stress-lab/plan-simulator',
    'stress-lab/insights',
  ] as const;

  return kinds.map((kind) => createStudioPluginDefinition(kind as StudioPluginKind, `${sessionNamespace}-${kind}`));
};

export const collectPluginEvents = (
  record: PluginExecutionRecord<unknown, unknown>[],
): readonly PluginEvent[] => {
  return record.map((entry) => {
    const pluginBase = String(entry.pluginId).split('::')[2] ?? 'unknown';
    return {
      name: toEventName(pluginBase as StudioPluginName, 'post'),
      pluginId: entry.pluginId as StudioPluginId,
      at: entry.finishedAt,
      metadata: {
        outputState: entry.output.ok,
      },
    };
  });
};

const pluginManifestSchema = {
  kind: 'studio-manifest-v1',
  namespace,
  requiredKinds: ['stress-lab/input-validator', 'stress-lab/runbook-optimizer'],
  createdBy: createTenantId('manifest-builder'),
};

export const catalogByTenant = (tenantId: TenantId): Readonly<Record<string, PluginManifestRecord[]>> => {
  const baseKey = `${tenantId}-base`;
  const catalog = buildStudioCatalog(tenantId).map((plugin): PluginManifestRecord => ({
    id: String(plugin.id),
    namespace: String(plugin.namespace),
    kind: plugin.kind,
    version: plugin.version,
    tags: plugin.tags,
  }));
  return {
    [baseKey]: catalog,
  };
}

export const normalizeStudioState = (state: StudioWorkspaceState): StudioWorkspaceState => {
  const signalCount = state.signals.length;
  const topologyCount = state.topologies.length;
  const runbookCount = state.plan?.runbooks.length ?? 0;
  return {
    ...state,
    runState: {
      ...state.runState,
      selectedBand: signalCount > 0 && topologyCount > 0 ? 'critical' : state.runState.selectedBand,
    },
    plan:
      state.plan && signalCount > 0
        ? {
            ...state.plan,
            estimatedCompletionMinutes: Math.max(1, signalCount + topologyCount + runbookCount),
          }
        : state.plan,
  };
};

export const isHighRiskManifest = (record: PluginManifestRecord): boolean => {
  const hasUrgent = record.tags.some((tag) => tag === 'risk:critical');
  return record.kind.includes('analysis') || hasUrgent;
};

export const createStudioRegistry = (tenantId: TenantId): PluginRegistry => {
  const registry = PluginRegistry.create(namespace as PluginNamespace);
  for (const plugin of buildStudioCatalog(tenantId)) {
    registry.register(plugin as PluginDefinition<unknown, unknown, Record<string, unknown>, StudioPluginKind>);
  }
  return registry;
};

export const executeStudioRegistry = async (
  tenantId: TenantId,
  state: StudioWorkspaceState,
  pluginContext: PluginContext<Record<string, unknown>>,
): Promise<readonly PluginEvent[]> => {
  const registry = createStudioRegistry(tenantId);
  const list = registry.list();

  const events: PluginEvent[] = [];
  const sessionConfig = createPluginSessionConfig(tenantId, namespace, `${tenantId}:session:${Date.now()}`);

  await withAsyncPluginScope(sessionConfig, async (session: PluginSession) => {
    for (const plugin of list) {
      const pre = toEventName(String(plugin.id) as StudioPluginName, 'pre');
      events.push({
        name: pre,
        pluginId: plugin.id as StudioPluginId,
        at: session.isOpen() ? session.getContext().startedAt : new Date().toISOString(),
        metadata: { tenantId },
      });

      const result = await runPluginWithSafeEnvelope(
        plugin as PluginDefinition<unknown, unknown, Record<string, unknown>, StudioPluginKind>,
        pluginContext,
        state,
      );

      events.push({
        name: toEventName(String(plugin.id) as StudioPluginName, 'post'),
        pluginId: plugin.id as StudioPluginId,
        at: new Date().toISOString(),
        metadata: {
          outputOk: result.ok,
          outputValue:
            result.ok && typeof result.value === 'object' && result.value !== null
              ? { keys: Object.keys(result.value as Record<string, unknown>).length }
              : null,
        },
      });
    }
  });

  return events;
};

export const executeStudioRegistryWithScopes = async (
  tenantId: TenantId,
  state: StudioWorkspaceState,
  pluginContext: PluginContext<Record<string, unknown>>,
): Promise<readonly PluginEvent[]> => {
  const config = createPluginSessionConfig(tenantId, namespace, `${tenantId}:sync:${Date.now()}`);
  return withPluginScope(config, () => {
    return executeStudioRegistry(tenantId, state, pluginContext);
  }) as Promise<readonly PluginEvent[]>;
};
