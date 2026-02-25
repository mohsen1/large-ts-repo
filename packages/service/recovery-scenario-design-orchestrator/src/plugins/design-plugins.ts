import { z } from 'zod';
import {
  ScenarioPluginRegistry,
  type ScenarioPlugin,
  type PluginContext,
  type RegistryId,
  type PluginByKind,
  runPluginSequence,
  registryDefaults,
  pluginMap,
  bootstrapCatalog,
  describeKind,
  isKnownKind,
  type StageKindToken,
} from '@shared/scenario-design-kernel';
import { StageKind, type StageTemplate } from '@domain/recovery-scenario-design';
import type { OrchestrationRunContext } from '@domain/recovery-scenario-design';

const pluginSchema = z.object({
  id: z.string().min(4),
  kind: z.enum(['ingress', 'enrichment', 'forecast', 'mitigation', 'verification', 'rollback', 'audit']),
  source: z.string().min(3),
  maxDelayMs: z.number().nonnegative(),
});

export type KnownStageKind = StageKind;
export type KnownPlugin = ScenarioPlugin<KnownStageKind, OrchestrationRunContext, unknown>;
export type KnownPluginRegistry = ScenarioPluginRegistry<readonly KnownPlugin[]>;

interface PluginRecord {
  readonly id: RegistryId;
  readonly kind: KnownStageKind;
  readonly label: string;
  readonly source: string;
  readonly maxDelayMs: number;
}

const knownPlugins: PluginRecord[] = [
  {
    id: 'plug-ingress-dns' as RegistryId,
    kind: 'ingress',
    label: 'Ingress DNS Warmup',
    source: 'recovery-fabric',
    maxDelayMs: 60,
  },
  {
    id: 'plug-enrichment-policy' as RegistryId,
    kind: 'enrichment',
    label: 'Policy Enricher',
    source: 'recovery-policy',
    maxDelayMs: 110,
  },
  {
    id: 'plug-forecast-signal' as RegistryId,
    kind: 'forecast',
    label: 'Signal Forecaster',
    source: 'recovery-signal',
    maxDelayMs: 150,
  },
  {
    id: 'plug-mitigation-lane' as RegistryId,
    kind: 'mitigation',
    label: 'Mitigation Router',
    source: 'recovery-orchestrator',
    maxDelayMs: 180,
  },
  {
    id: 'plug-verification-guard' as RegistryId,
    kind: 'verification',
    label: 'Verification Guard',
    source: 'recovery-quality',
    maxDelayMs: 75,
  },
  {
    id: 'plug-rollback-controller' as RegistryId,
    kind: 'rollback',
    label: 'Rollback Controller',
    source: 'recovery-ops',
    maxDelayMs: 100,
  },
  {
    id: 'plug-audit-trace' as RegistryId,
    kind: 'audit',
    label: 'Audit Envelope',
    source: 'recovery-ledger',
    maxDelayMs: 30,
  },
] as const;

const safe = pluginSchema.array().safeParse(knownPlugins);

const catalogReady = await bootstrapCatalog;
const catalogByKind = new Map<string, StageKindToken<KnownStageKind>>(
  catalogReady.map((entry) => [entry.kind, entry.token as StageKindToken<KnownStageKind>]),
);

function normalizePluginEntry(raw: PluginRecord): PluginRecord {
  const parsed = pluginSchema.parse(raw);
  return {
    id: `plugin-${parsed.id}` as RegistryId,
    kind: parsed.kind,
    label: parsed.id,
    source: parsed.source,
    maxDelayMs: parsed.maxDelayMs,
  };
}

export function pluginContextFromRun<TInput>(runId: string, correlation: string, extra: string): PluginContext {
  return {
    runId,
    scenario: correlation,
    clock: BigInt(extra.length + runId.length),
  };
}

function toDomainPlugin(input: PluginRecord, context: PluginContext): KnownPlugin {
  const token = catalogByKind.get(input.kind) ?? 'ingress:v1' as StageKindToken<KnownStageKind>;
  const kindDefinition = isKnownKind(input.kind) ? describeKind(input.kind) : undefined;
  const details = kindDefinition?.requirements.join(',') ?? 'unknown';

  return {
    id: input.id,
    label: `${input.label}:${context.scenario}`,
    kind: input.kind,
    config: {
      ...kindDefinition,
      endpoint: `${context.scenario}-endpoint`,
      timeoutMs: input.maxDelayMs,
      threshold: 0,
      sources: [input.source, details],
      horizonMs: input.maxDelayMs * 2,
      confidence: 0.94,
      maxRetries: 2,
      checks: [details],
      rollbackId: `${input.id}:${context.runId}`,
      hardCutover: false,
      auditOnly: false,
    } as KnownPlugin['config'],
    execute: async (inputPayload: OrchestrationRunContext, pluginContext: PluginContext) => {
      await Promise.resolve();
      const tokenized = token as StageKindToken<KnownStageKind>;
      return {
        ...inputPayload,
        metadata: {
          plugin: input.id,
          stageKind: tokenized,
          scenario: pluginContext.scenario,
          runId: pluginContext.runId,
        },
      };
    },
  };
}

function normalizeToRecord(plugins: readonly PluginRecord[]): readonly PluginRecord[] {
  return plugins
    .map((entry) => normalizePluginEntry(entry))
    .toSorted((left, right) => left.source.localeCompare(right.source));
}

export async function loadDesignPlugins(context: PluginContext): Promise<
  ScenarioPluginRegistry<readonly KnownPlugin[]>
> {
  const loaded = await Promise.resolve(normalizeToRecord(knownPlugins));
  const plugins = loaded.map((entry) => toDomainPlugin(entry, context));
  const registry = new ScenarioPluginRegistry<readonly KnownPlugin[]>(plugins);
  const all = pluginMap(registry);

  if (registryDefaults.strictMode && all.size < registry.count) {
    throw new Error('duplicate plugin labels');
  }

  return registry;
}

export function pluginByKind<TKind extends KnownStageKind>(
  registry: KnownPluginRegistry,
  kind: TKind,
): readonly PluginByKind<readonly KnownPlugin[], TKind>[] {
  return registry.byKind(kind) as readonly PluginByKind<readonly KnownPlugin[], TKind>[];
}

export async function runPluginsForTemplate<TInput extends object, TOutput>(
  context: PluginContext,
  template: readonly StageTemplate<TInput, unknown, TOutput>[],
): Promise<TOutput> {
  const registry = await loadDesignPlugins(context);
  const payload = template.map((stage) => stage.outputShape);
  const all = [...registry.all()];

  const pluginsByKind = all.filter((plugin) => template.some((stage) => stage.kind === plugin.kind));
  if (pluginsByKind.length === 0) {
    return (payload as unknown) as TOutput;
  }

  await using scoped = registry;
  const out = await runPluginSequence(
    payload[0] as TInput,
    pluginsByKind as readonly KnownPlugin[],
    {
      runId: context.scenario,
      scenario: context.scenario,
      clock: context.correlationId.length,
    },
  );

  return out as TOutput;
}
