import {
  nodeId,
  runId,
  scenarioId,
  signalId,
  tenantId,
  type ScenarioSeed,
  type QuantumProfile,
  type QuantumNode,
  namespaceId,
  normalizeProfile,
} from './domain';
import {
  pluginKinds,
  ensurePluginName,
  type PluginName,
  type QuantumPluginKind,
  type PluginDefinition,
} from './plugins';

export type FixtureMode = 'discovery' | 'control' | 'synthesis';

export type FixtureDescriptor = {
  readonly title: string;
  readonly scenarioId: string;
  readonly tenant: string;
  readonly mode: FixtureMode;
  readonly labels: readonly string[];
};

export const defaultNode = (id: string, role: QuantumNode['role'], route: `/${string}`): QuantumNode => ({
  id: nodeId(id),
  role,
  route,
});

export const quantumNodes = [
  defaultNode('ingest', 'source', '/ingest'),
  defaultNode('transform', 'processor', '/transform'),
  defaultNode('signal', 'processor', '/signal'),
  defaultNode('safety', 'sink', '/safety'),
] as const;

export const quantumEdges = [
  { from: quantumNodes[0].id, to: quantumNodes[1].id, latencyMs: 8 },
  { from: quantumNodes[1].id, to: quantumNodes[2].id, latencyMs: 11 },
  { from: quantumNodes[2].id, to: quantumNodes[3].id, latencyMs: 14 },
] as const;

export const pluginRouteByKind = {
  source: 'source',
  transform: 'transform',
  gate: 'guard',
  safety: 'safety',
  synthesis: 'synthesis',
} as const satisfies { [K in QuantumPluginKind]: string };

const baselineProfileFromDescriptor = (descriptor: FixtureDescriptor): QuantumProfile<FixtureMetadata> => {
  return normalizeProfile({
    namespace: namespaceId('recovery'),
    tenant: tenantId(descriptor.tenant),
    scenarioId: scenarioId(descriptor.scenarioId),
    scenarioName: descriptor.title,
    graph: {
      nodes: quantumNodes,
      edges: quantumEdges,
    },
    metadata: {
      source: descriptor.labels,
      labels: descriptor.labels,
      runId: runId(`${descriptor.scenarioId}-seed`),
    },
    seedSignals: [
      { signalId: signalId(`${descriptor.scenarioId}:A`), tier: 1, weight: 0.31 },
      { signalId: signalId(`${descriptor.scenarioId}:B`), tier: 2, weight: 0.41 },
      { signalId: signalId(`${descriptor.scenarioId}:C`), tier: 3, weight: 0.16 },
    ],
  });
};

export type FixtureMetadata = {
  readonly source: readonly string[];
  readonly labels: readonly string[];
  readonly runId: ReturnType<typeof runId>;
};

export const fixtureDescriptors = [
  {
    title: 'Continuity discovery',
    scenarioId: 'control-plane/discovery',
    tenant: 'tenant-a',
    mode: 'discovery' as const,
    labels: ['control', 'discovery', 'primary'],
  },
  {
    title: 'Policy synthesis',
    scenarioId: 'safety-policy/synthesis',
    tenant: 'tenant-a',
    mode: 'synthesis' as const,
    labels: ['policy', 'synthesis', 'policy-graph'],
  },
  {
    title: 'Signal control',
    scenarioId: 'signal-control/adaptive',
    tenant: 'tenant-b',
    mode: 'control' as const,
    labels: ['signal', 'control', 'feedback'],
  },
] as const satisfies readonly FixtureDescriptor[];

export const validateFixture = (value: unknown): value is FixtureDescriptor => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.scenarioId === 'string' &&
    typeof candidate.tenant === 'string' &&
    ['discovery', 'control', 'synthesis'].includes(candidate.mode as string) &&
    Array.isArray(candidate.labels) &&
    candidate.labels.every((value) => typeof value === 'string')
  );
};

export const fixtureToSeed = async (descriptor: FixtureDescriptor): Promise<ScenarioSeed<FixtureMetadata>> => {
  const selectedPlugins = pluginKinds.map((kind) => ensurePluginName('recovery', pluginRouteByKind[kind])) as readonly PluginName[];

  return {
    tenant: tenantId(descriptor.tenant),
    scenarioId: scenarioId(descriptor.scenarioId),
    profile: baselineProfileFromDescriptor(descriptor),
    selectedPlugins,
    requestedMode: descriptor.mode,
  };
};

export const fixturePlan = async (): Promise<readonly ScenarioSeed<FixtureMetadata>[]> => {
  const descriptors = fixtureDescriptors.filter(validateFixture);
  const loaded = await Promise.all(descriptors.map((descriptor) => fixtureToSeed(descriptor)));
  return loaded;
};

const sourcePayload = (value: string) => ({ message: `source:${value}`, safe: true, startedBy: value });

const transformPayload = (value: string) => ({ message: `transform:${value}`, transformed: true });

const guardPayload = (value: string) => ({ message: `guard:${value}`, gatedBy: runId(value), safe: true });

const safetyPayload = (value: string) => ({ message: `safety:${value}`, safe: true });

const synthesisPayload = (value: string) => ({ message: `synthesis:${value}`, synthesized: true, namespace: namespaceId('recovery') });

export const fixturePlugins = [
  {
    namespace: 'recovery',
    name: ensurePluginName('recovery', 'source'),
    kind: 'source',
    tags: ['ingest', 'source'],
    dependsOn: [],
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      version: 'v1.0.0',
      owner: 'owner:recovery',
    },
    async run(_input: unknown) {
      return {
        status: 'success',
        skipped: false,
        payload: {
          ...sourcePayload(runId('source')),
          kind: 'source',
          namespace: namespaceId('recovery'),
          metadata: {},
          startedBy: runId('source-run'),
        },
        artifacts: ['seed:source'],
        elapsedMs: 1,
      };
    },
    async transform(input: unknown) {
      return input;
    },
  },
  {
    namespace: 'recovery',
    name: ensurePluginName('recovery', 'transform'),
    kind: 'transform',
    tags: ['transform'],
    dependsOn: [ensurePluginName('recovery', 'source')],
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      version: 'v1.0.0',
      owner: 'owner:recovery',
    },
    async run(input: unknown) {
      return {
        status: 'success',
        skipped: false,
        payload: {
          ...transformPayload(runId('transform')),
          source: input,
        },
        artifacts: ['seed:transform'],
        elapsedMs: 6,
      };
    },
    async transform(input: unknown) {
      return input;
    },
  },
  {
    namespace: 'recovery',
    name: ensurePluginName('recovery', 'guard'),
    kind: 'gate',
    tags: ['guard'],
    dependsOn: [ensurePluginName('recovery', 'transform')],
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      version: 'v1.0.0',
      owner: 'owner:recovery',
    },
    async run(input: unknown) {
      if (!input) {
        return {
          status: 'error',
          skipped: false,
          payload: null,
          artifacts: ['seed:guard-fail'],
          elapsedMs: 2,
          reason: {
            code: 'error-code:guard',
            details: ['missing-input'],
          },
        };
      }

      return {
        status: 'success',
        skipped: false,
        payload: {
          ...guardPayload(runId('guard')),
          source: input,
          safeBypass: ensurePluginName('recovery', 'source'),
        },
        artifacts: ['seed:guard'],
        elapsedMs: 2,
      };
    },
    async transform(input: unknown) {
      return input;
    },
  },
  {
    namespace: 'recovery',
    name: ensurePluginName('recovery', 'safety'),
    kind: 'safety',
    tags: ['safety'],
    dependsOn: [ensurePluginName('recovery', 'guard')],
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      version: 'v1.0.0',
      owner: 'owner:recovery',
    },
    async run(input: unknown) {
      return {
        status: 'success',
        skipped: false,
        payload: {
          ...safetyPayload(runId('safety')),
          transform: input,
        },
        artifacts: ['seed:safety'],
        elapsedMs: 3,
      };
    },
    async transform(input: unknown) {
      return input;
    },
  },
  {
    namespace: 'recovery',
    name: ensurePluginName('recovery', 'synthesis'),
    kind: 'synthesis',
    tags: ['synthesis'],
    dependsOn: [ensurePluginName('recovery', 'safety')],
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      version: 'v1.0.0',
      owner: 'owner:recovery',
    },
    async run(input: unknown) {
      return {
        status: 'success',
        skipped: false,
        payload: {
          ...synthesisPayload(runId('synthesis')),
          safety: input,
        },
        artifacts: ['seed:synthesis'],
        elapsedMs: 12,
      };
    },
    async transform(input: unknown) {
      return input;
    },
  },
] as unknown as readonly PluginDefinition<any, any, any, any, any, any>[];

export type FixturePlugin = (typeof fixturePlugins)[number];

export const baselineFixtures = {
  defaults: fixturePlugins,
  plan: fixturePlan,
} as const;

export const loadFixturePlan = async (): Promise<readonly ScenarioSeed<FixtureMetadata>[]> => fixturePlan();

export const describeFixtures = (seeds: readonly ScenarioSeed<FixtureMetadata>[]): readonly string[] =>
  seeds.map((seed) => `${seed.tenant}/${seed.scenarioId} (${seed.requestedMode})`);
