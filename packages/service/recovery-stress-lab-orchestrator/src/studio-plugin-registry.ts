import {
  PluginDefinition,
  PluginExecutionRecord,
  PluginKind,
  PluginResult,
  PluginRegistry,
  PluginContext,
  collectIterable,
  mapIterable,
  zipLongest,
  type PluginId,
  type PluginNamespace,
  type PluginSessionConfig,
  type PluginTag,
  createPluginId,
  buildPluginVersion,
  canonicalizeNamespace,
  runPluginWithSafeEnvelope,
  PluginEventName,
  withAsyncPluginScope,
} from '@shared/stress-lab-runtime';
import {
  CommandRunbook,
  OrchestrationPlan,
  RecoverySignal,
  RecoverySimulationResult,
  TenantId,
  WorkloadTarget,
} from '@domain/recovery-stress-lab';
import {
  parseManifestToDomain,
  buildDefaultManifest,
  StudioParsedManifest,
  manifestPluginTuples,
} from './studio-plugin-manifest';

export type StudioPluginConfig = {
  readonly tenantId: TenantId;
  readonly namespace: PluginNamespace;
  readonly stage: StudioStage;
};

export type StudioStage = 'input' | 'shape' | 'plan' | 'simulate' | 'recommend' | 'report';

export type StudioRuntimeInput = {
  readonly tenantId: TenantId;
  readonly signals: readonly RecoverySignal[];
  readonly topology: readonly WorkloadTarget[];
  readonly runbooks: readonly CommandRunbook[];
};

export interface StudioRuntimeState {
  readonly tenantId: TenantId;
  readonly stage: StudioStage;
  readonly simulation: RecoverySimulationResult | null;
  readonly plan: OrchestrationPlan | null;
}

const pluginInputKinds: readonly PluginKind[] = [
  'stress-lab/input-validator',
  'stress-lab/topology-builder',
  'stress-lab/signal-sanitizer',
] as const;

const pluginWorkKinds: readonly PluginKind[] = ['stress-lab/runbook-optimizer', 'stress-lab/simulator', 'stress-lab/reporter'];

const buildTag = (tenantId: TenantId): PluginTag => ({
  namespace: canonicalizeNamespace('recovery:stress:lab'),
  kind: 'stress-lab/runtime',
  version: buildPluginVersion(1, 0, 0),
});

const stageFor = (kind: string): StudioStage => {
  if (kind.includes('input') || kind.includes('signal')) return 'input';
  if (kind.includes('topology') || kind.includes('sanitizer')) return 'shape';
  if (kind.includes('runbook') || kind.includes('optimizer')) return 'plan';
  if (kind.includes('simulator')) return 'simulate';
  if (kind.includes('recommend') || kind.includes('report')) return 'report';
  return 'recommend';
};

const wrapPlugin = <TInput extends unknown, TOutput extends unknown>(definition: {
  id: string;
  name: string;
  kind: PluginKind;
  run: (ctx: PluginContext, input: TInput) => Promise<PluginResult<TOutput>>;
}): PluginDefinition<TInput, TOutput, Record<string, unknown>, StudioPluginKind> => {
  const namespace = canonicalizeNamespace('recovery:stress:lab');
  return {
    id: createPluginId(namespace, definition.kind, definition.id),
    name: definition.name,
    namespace,
    kind: definition.kind as string as StudioPluginKind,
    version: buildPluginVersion(1, 0, 0),
    tags: ['runtime', definition.kind],
    dependencies: ['dep:stress-lab-runtime'],
    config: {
      name: definition.name,
      kind: definition.kind,
    },
    run: definition.run,
  };
};

export type StudioPluginKind = `stress-lab/${string}`;

type PluginExecutionEnvelope = {
  readonly plugin: PluginDefinition<unknown, unknown, Record<string, unknown>, StudioPluginKind>;
  readonly config: {
    readonly tenantId: TenantId;
    readonly order: number;
    readonly stage: StudioStage;
  };
};

export const buildStudioPluginCatalog = async (tenantId: TenantId): Promise<readonly PluginExecutionEnvelope[]> => {
  const manifest = await buildDefaultManifest();
  const domainManifest = parseManifestToDomain({
    tenantId,
    pluginSets: [...manifest.pluginSets],
    timestamp: manifest.timestamp,
    plugins: manifest.plugins.map((entry) => ({ ...entry })),
  });

  const tuple = manifestPluginTuples(domainManifest);
  const definitions = tuple
    .filter((entry) => entry[0] !== 'simulator' || entry[2] >= '1.0.0')
    .map(([id, kind], index): PluginExecutionEnvelope => ({
      plugin: wrapPlugin({
        id,
        name: `${tenantId}:${id}`,
        kind: kind as PluginKind,
        run: async () => {
          return {
            ok: true,
            value: { accepted: true, manifestEntry: id, tenantId },
            generatedAt: new Date().toISOString(),
          };
        },
      }),
      config: {
        tenantId,
        order: index,
        stage: stageFor(kind),
      },
    }));

  return definitions;
};

const runSinglePlugin = async (
  plugin: PluginDefinition<unknown, unknown, Record<string, unknown>, StudioPluginKind>,
  context: PluginContext,
  input: unknown,
  stage: StudioStage,
): Promise<PluginResult<unknown>> => {
  if (plugin.tags.includes('disabled')) {
    return {
      ok: false,
      errors: ['plugin disabled'],
      generatedAt: new Date().toISOString(),
    };
  }

  const output = await runPluginWithSafeEnvelope(plugin, context, input);
  return { ...output, generatedAt: new Date().toISOString() };
};

export const buildStudioRegistry = async (
  tenantId: TenantId,
): Promise<PluginRegistry> => {
  const registry = PluginRegistry.create(canonicalizeNamespace('recovery:stress:lab'));
  const entries = await buildStudioPluginCatalog(tenantId);

  for (const entry of entries) {
    registry.register(entry.plugin);
  }

  return registry;
};

export const executeStudioPlugins = async (
  tenantId: TenantId,
  context: PluginContext,
  initialInput: StudioRuntimeInput,
): Promise<{
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly events: readonly string[];
}> => {
  const registry = await buildStudioRegistry(tenantId);
  const plugins = registry.list();
  const stageOrder: StudioStage[] = ['input', 'shape', 'plan', 'simulate', 'recommend', 'report'];
  const executionRecords: string[] = [];

  const grouped = new Map<StudioStage, PluginDefinition<unknown, unknown, Record<string, unknown>, StudioPluginKind>[]>();

  for (const plugin of plugins) {
    const stage = stageFor(plugin.kind);
    const bucket = grouped.get(stage);
    if (!bucket) {
      grouped.set(stage, [plugin]);
    } else {
      bucket.push(plugin);
    }
  }

  let state: {
    plan: OrchestrationPlan | null;
    simulation: RecoverySimulationResult | null;
    payload: StudioRuntimeInput;
  } = {
    plan: null,
    simulation: null,
    payload: initialInput,
  };

  await withAsyncPluginScope({
    tenantId,
    namespace: canonicalizeNamespace('recovery:stress:lab'),
    requestId: `${tenantId}:${Date.now()}`,
    startedAt: new Date().toISOString(),
  } satisfies PluginSessionConfig, async () => {
    for (const stage of stageOrder) {
      const bucket = grouped.get(stage) ?? [];
      for (const plugin of bucket) {
        const result = await runSinglePlugin(plugin, context, state.payload, stage);
        executionRecords.push(`${String(plugin.id)}:${result.ok ? 'ok' : 'fail'}`);

        if (!result.ok) {
          break;
        }

        if (stage === 'plan' && result.value) {
          state = {
            ...state,
            plan: {
              tenantId,
              scenarioName: `studio-${tenantId}`,
              schedule: [],
              runbooks: initialInput.runbooks,
              dependencies: { nodes: [], edges: [] },
              estimatedCompletionMinutes: initialInput.runbooks.length,
            },
          };
        }

        if (stage === 'simulate' && result.value) {
          state = {
            ...state,
            simulation: {
              tenantId,
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              selectedRunbooks: initialInput.runbooks.map((runbook) => runbook.id),
              ticks: [],
              riskScore: 0.12,
              slaCompliance: 0.94,
              notes: [`stage=${stage}`, `runbooks=${initialInput.runbooks.length}`],
            },
          };
        }
      }
    }
  });

  return {
    plan: state.plan,
    simulation: state.simulation,
    events: executionRecords,
  };
};
