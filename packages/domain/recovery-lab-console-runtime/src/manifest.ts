import { z } from 'zod';
import { type NoInfer } from '@shared/type-level';
import {
  createPluginId,
  type RuntimeManifest,
  type RuntimePlugin,
  type RuntimeContext,
  type RuntimePolicyMode,
  type RuntimeScope,
  type RuntimeStage,
  runtimeScopes,
  runtimeStages,
  runtimePolicyModes,
} from './types.js';

const pluginSeedSchema = z.object({
  seed: z.string().min(1),
  stage: z.enum(runtimeStages as unknown as [string, ...string[]]),
  scope: z.enum(runtimeScopes as unknown as [string, ...string[]]),
  mode: z.enum(runtimePolicyModes as unknown as [string, ...string[]]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  produces: z.array(z.string()).default([]),
  consumes: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  weight: z.number().min(0).max(10),
  metadata: z.record(z.string(), z.string()).default({}),
});

const manifestSeedSchema = z.object({
  plugin: pluginSeedSchema,
  group: z.string().min(1),
  category: z.enum(runtimeScopes as unknown as [string, ...string[]]),
  priority: z.number().int().min(0).max(100),
  tags: z.array(z.string()).default([]),
});

type CatalogSeedInput = z.input<typeof manifestSeedSchema>[];
type CatalogSeedOutput = z.output<typeof manifestSeedSchema>[];
type ParsedCatalogSeed = CatalogSeedOutput[number];

const seedCatalog: CatalogSeedInput = [
  {
    plugin: {
      seed: 'topology-mapper',
      stage: 'collect',
      scope: 'topology',
      mode: 'adaptive',
      version: '1.0.0',
      produces: ['topology'],
      consumes: ['raw-topology'],
      dependencies: [],
      weight: 3,
      metadata: { latency: 'low', criticality: 'high' },
    },
    group: 'core',
    category: 'topology',
    priority: 40,
    tags: ['topology', 'core'],
  },
  {
    plugin: {
      seed: 'signal-normalizer',
      stage: 'normalize',
      scope: 'signal',
      mode: 'predictive',
      version: '1.1.0',
      produces: ['normalized-signal'],
      consumes: ['raw-signal'],
      dependencies: ['topology-mapper'],
      weight: 2,
      metadata: { latency: 'medium' },
    },
    group: 'core',
    category: 'signal',
    priority: 35,
    tags: ['signal', 'normalize'],
  },
  {
    plugin: {
      seed: 'policy-router',
      stage: 'adapt',
      scope: 'policy',
      mode: 'resilient',
      version: '1.3.0',
      produces: ['policy-route'],
      consumes: ['normalized-signal'],
      dependencies: ['signal-normalizer'],
      weight: 4,
      metadata: { criticality: 'critical' },
    },
    group: 'policy',
    category: 'policy',
    priority: 36,
    tags: ['policy', 'router'],
  },
  {
    plugin: {
      seed: 'command-composer',
      stage: 'simulate',
      scope: 'command',
      mode: 'manual',
      version: '2.0.0',
      produces: ['command-plan'],
      consumes: ['policy-route'],
      dependencies: ['policy-router'],
      weight: 5,
      metadata: { complexity: 'high' },
    },
    group: 'control',
    category: 'command',
    priority: 30,
    tags: ['simulate', 'command'],
  },
  {
    plugin: {
      seed: 'telemetry-correlator',
      stage: 'forecast',
      scope: 'telemetry',
      mode: 'adaptive',
      version: '1.2.0',
      produces: ['forecast'],
      consumes: ['command-plan'],
      dependencies: ['command-composer'],
      weight: 3,
      metadata: { observability: 'high' },
    },
    group: 'telemetry',
    category: 'telemetry',
    priority: 27,
    tags: ['forecast', 'telemetry'],
  },
  {
    plugin: {
      seed: 'recommendation-refiner',
      stage: 'recommend',
      scope: 'synthesis',
      mode: 'predictive',
      version: '1.1.0',
      produces: ['recommendation'],
      consumes: ['forecast'],
      dependencies: ['telemetry-correlator'],
      weight: 3,
      metadata: { quality: 'high' },
    },
    group: 'synthesis',
    category: 'synthesis',
    priority: 32,
    tags: ['recommend', 'synthesis'],
  },
];

const pluginExecutors: Record<string, (input: unknown, context: RuntimeContext) => Promise<unknown>> = {
  'topology-mapper': async (input) => ({
    ...(typeof input === 'object' && input ? input : {}),
    topology: ['edge-a', 'edge-b', 'edge-c'],
    metadata: { normalized: true },
    mode: 'collect',
  }),
  'signal-normalizer': async (input) => ({
    ...(typeof input === 'object' && input ? input : {}),
    normalized: true,
    signalStrength: 0.95,
  }),
  'policy-router': async (input) => ({
    ...(typeof input === 'object' && input ? input : {}),
    route: 'policy-router',
    policyScore: 0.81,
    commandQueue: ['failover', 'route', 'repair'],
  }),
  'command-composer': async (input) => ({
    ...(typeof input === 'object' && input ? input : {}),
    commandPlan: ['freeze', 'route', 'heal'],
    estimatedImpact: 7,
  }),
  'telemetry-correlator': async (input) => ({
    ...(typeof input === 'object' && input ? input : {}),
    forecast: [
      { window: '5m', confidence: 0.88 },
      { window: '30m', confidence: 0.77 },
    ],
    trend: 'stabilizing',
  }),
  'recommendation-refiner': async (input) => ({
    ...(typeof input === 'object' && input ? input : {}),
    recommendations: ['stabilize-traffic', 'increase-observability', 'reduce-jitter'],
    priority: 1,
    rationale: 'adaptive loop completion',
  }),
};

const toTypedPlugin = (seed: ParsedCatalogSeed, _index: number): RuntimePlugin => {
  const stage = seed.plugin.stage as RuntimeStage;
  const scope = seed.plugin.scope as RuntimeScope;
  const mode = seed.plugin.mode as RuntimePolicyMode;
  return {
    id: createPluginId(seed.group, stage),
    name: seed.plugin.seed,
    stage,
    scope,
    mode,
    dependencies: (seed.plugin.dependencies ?? []).map((dependency: string) => createPluginId(dependency, stage)),
    produces: seed.plugin.produces ?? [],
    consumes: seed.plugin.consumes ?? [],
    weight: seed.plugin.weight,
    metadata: seed.plugin.metadata ?? {},
    version: seed.plugin.version as `${number}.${number}.${number}`,
    execute: async (input, context) => {
      const runner = pluginExecutors[seed.plugin.seed] ?? ((value) => Promise.resolve(value));
      return runner(input, context);
    },
  };
};

const parseSeedCatalog = (seedEntries: readonly CatalogSeedInput[number][]): CatalogSeedOutput => manifestSeedSchema.array().parse(seedEntries);
const parsedSeed = parseSeedCatalog(seedCatalog);

const asManifest = (entry: ParsedCatalogSeed, index: number): RuntimeManifest => ({
  plugin: toTypedPlugin(entry, index),
  name: `${entry.group}:${entry.plugin.seed}` as RuntimeManifest['name'],
  category: entry.category as RuntimeScope,
  group: entry.group as RuntimeManifest['group'],
  priority: entry.priority,
  tags: entry.tags,
  channel: `run:${entry.plugin.seed}:${entry.plugin.stage}` as RuntimeManifest['channel'],
});

export const catalogEntries = parsedSeed
  .map((entry, index) => asManifest(entry, index))
  .toSorted((left, right) => left.priority - right.priority) satisfies readonly RuntimeManifest[];

const validator = z
  .array(
    z.object({
      plugin: pluginSeedSchema,
      group: z.string(),
      category: z.enum(runtimeScopes as unknown as [string, ...string[]]),
      priority: z.number(),
      tags: z.array(z.string()),
    }),
  )
  .describe('runtime plugin validator');

export const validateCatalog = (
  manifests: readonly RuntimeManifest[] = catalogEntries,
): { readonly ok: true; readonly manifests: readonly RuntimeManifest[] } => {
  const catalogPayload = manifests.map((entry) => ({
    plugin: {
      seed: entry.plugin.name,
      stage: entry.plugin.stage,
      scope: entry.plugin.scope,
      mode: entry.plugin.mode,
      version: entry.plugin.version,
      produces: [...entry.plugin.produces],
      consumes: [...entry.plugin.consumes],
      dependencies: [...entry.plugin.dependencies],
      weight: entry.plugin.weight,
      metadata: { ...entry.plugin.metadata },
    },
    group: String(entry.group),
    category: String(entry.category),
    priority: entry.priority,
    tags: [...entry.tags],
  }));
  const parsed = validator.safeParse(catalogPayload);

  if (!parsed.success) {
    throw new Error(`invalid runtime catalog: ${parsed.error.message}`);
  }
  return { ok: true, manifests };
};

export const catalogSnapshot = (): readonly {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly stage: string;
  readonly weight: number;
}[] =>
  catalogEntries.map((entry) => ({
    id: String(entry.plugin.id),
    name: String(entry.name),
    scope: String(entry.category),
    stage: String(entry.plugin.stage),
    weight: entry.priority,
  }));

export const buildCatalog = <TManifests extends readonly RuntimeManifest[]>(
  manifests: NoInfer<TManifests>,
): Readonly<TManifests> => manifests;

export const catalogTemplateNames = catalogEntries
  .map((entry) => entry.plugin.name)
  .toSorted()
  .map((name, index) => `${index}:${String(name)}`);
