import {
  STAGE_ORDER,
  STAGE_SEQUENCE,
  type PluginId,
  type PluginKind,
  parseTenantId,
  parseWorkspaceId,
  type StudioManifestCatalog,
} from './contracts';

const catalogSeed: readonly {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly pluginIds: readonly string[];
  readonly pluginCatalog: {
    readonly domain: string;
    readonly name: string;
    readonly kind: PluginKind;
    readonly id: string;
    readonly namespace: string;
    readonly title: string;
    readonly description: string;
    readonly version: `v${number}.${number}.${number}`;
    readonly tags: readonly string[];
    readonly dependencies: readonly { readonly upstreamId: string; readonly optional: boolean; readonly weight: number; }[];
    readonly input: {
      readonly schema: { readonly kind: string; readonly data: Record<string, unknown> };
      readonly examples: readonly Record<string, unknown>[];
    };
    readonly output: {
      readonly schema: { readonly kind: string; readonly data: Record<string, unknown>; readonly score: number };
      readonly examples: readonly { readonly kind: string; readonly data: Record<string, unknown>; readonly score: number }[];
    };
    readonly run: (input: { readonly kind: string; readonly data: Record<string, unknown> }, context: { readonly metadata: Record<string, string> }) => Promise<{
      readonly kind: string;
      readonly data: Record<string, unknown>;
      readonly score: number;
    }>;
  }[];
  readonly spec: { readonly seed: number; readonly parallelism: number; readonly strict: boolean; readonly traceLevel: 'off' | 'minimal' | 'verbose' };
}[] = [
  {
    tenantId: 'tenant:alpha-1',
    workspaceId: 'workspace:alpha-1',
    pluginIds: [
      'studio-alpha:ingest:v1',
      'studio-alpha:validate:v1',
      'studio-alpha:plan:v1',
      'studio-alpha:execute:v1',
      'studio-alpha:finalize:v1',
    ],
    pluginCatalog: [
      {
        domain: 'alpha',
        name: 'ingest',
        kind: 'ingest',
        id: 'studio-alpha:ingest:v1',
        namespace: 'studio:alpha',
        title: 'Ingest',
        description: 'normalize seed payload for deterministic transitions',
        version: 'v1.0.0',
        tags: ['core'],
        dependencies: [],
        input: {
          schema: { kind: 'seed', data: {} },
          examples: [{ stage: 'seed', scenario: 'bootstrap' }],
        },
        output: {
          schema: { kind: 'seed', data: { ingested: true }, score: 88 },
          examples: [{ kind: 'seed', data: { ingested: true }, score: 88 }],
        },
        run: async (input, _context) => ({
          kind: 'seed',
          data: { ...input.data, ingested: true },
          score: 80,
        }),
      },
      {
        domain: 'alpha',
        name: 'validate',
        kind: 'validate',
        id: 'studio-alpha:validate:v1',
        namespace: 'studio:alpha',
        title: 'Validate',
        description: 'validate schema and policy guardrails',
        version: 'v1.0.0',
        tags: ['guard'],
        dependencies: [{ upstreamId: 'studio-alpha:ingest:v1', optional: false, weight: 1 }],
        input: { schema: { kind: 'seed', data: { ingested: true } }, examples: [{ ingested: true }] },
        output: { schema: { kind: 'validated', data: { validated: true }, score: 89 }, examples: [{ kind: 'validated', data: { validated: true }, score: 89 }] },
        run: async (input, _context) => ({
          kind: 'validated',
          data: { ...input.data, validated: true },
          score: 94,
        }),
      },
      {
        domain: 'alpha',
        name: 'plan',
        kind: 'plan',
        id: 'studio-alpha:plan:v1',
        namespace: 'studio:alpha',
        title: 'Plan',
        description: 'create deterministic plan envelope',
        version: 'v1.0.0',
        tags: ['strategy'],
        dependencies: [{ upstreamId: 'studio-alpha:validate:v1', optional: false, weight: 2 }],
        input: {
          schema: { kind: 'validated', data: { validated: true } },
          examples: [{ validated: true, strategy: 'standard' }],
        },
        output: {
          schema: { kind: 'plan', data: { plan: ['drain', 'restore', 'verify'] }, score: 86 },
          examples: [{ kind: 'plan', data: { plan: ['drain', 'restore', 'verify'] }, score: 86 }],
        },
        run: async (input, _context) => ({
          kind: 'plan',
          data: { ...input.data, plan: ['drain', 'restore', 'verify'] },
          score: 76,
        }),
      },
      {
        domain: 'alpha',
        name: 'execute',
        kind: 'execute',
        id: 'studio-alpha:execute:v1',
        namespace: 'studio:alpha',
        title: 'Execute',
        description: 'run execution plan',
        version: 'v1.0.0',
        tags: ['execution'],
        dependencies: [{ upstreamId: 'studio-alpha:plan:v1', optional: true, weight: 3 }],
        input: {
          schema: { kind: 'plan', data: { plan: ['drain'] } },
          examples: [{ plan: ['drain'] }],
        },
        output: {
          schema: { kind: 'execution', data: { executed: true }, score: 82 },
          examples: [{ kind: 'execution', data: { executed: true }, score: 82 }],
        },
        run: async (input, _context) => ({
          kind: 'execution',
          data: { ...input.data, executed: true },
          score: 77,
        }),
      },
      {
        domain: 'alpha',
        name: 'finalize',
        kind: 'finalize',
        id: 'studio-alpha:finalize:v1',
        namespace: 'studio:alpha',
        title: 'Finalize',
        description: 'finalize orchestration snapshot',
        version: 'v1.0.0',
        tags: ['closeout'],
        dependencies: [{ upstreamId: 'studio-alpha:execute:v1', optional: false, weight: 1 }],
        input: {
          schema: { kind: 'execution', data: { executed: true } },
          examples: [{ executed: true }],
        },
        output: {
          schema: { kind: 'result', data: { closed: true }, score: 100 },
          examples: [{ kind: 'result', data: { closed: true }, score: 100 }],
        },
        run: async (input, _context) => ({
          kind: 'result',
          data: { ...input.data, closed: true },
          score: 98,
        }),
      },
    ],
    spec: {
      seed: 10001,
      parallelism: 3,
      strict: true,
      traceLevel: 'verbose',
    },
  },
  {
    tenantId: 'tenant:beta-2',
    workspaceId: 'workspace:beta-2',
    pluginIds: ['studio-beta:ingest:v1', 'studio-beta:execute:v1', 'studio-beta:finalize:v1'],
    pluginCatalog: [
      {
        domain: 'beta',
        name: 'ingest',
        kind: 'ingest',
        id: 'studio-beta:ingest:v1',
        namespace: 'studio:beta',
        title: 'Beta ingest',
        description: 'collect baseline signals',
        version: 'v1.0.0',
        tags: ['beta'],
        dependencies: [],
        input: {
          schema: { kind: 'seed', data: {} },
          examples: [{ tenant: 'beta' }],
        },
        output: {
          schema: { kind: 'seed', data: { ingested: true, tenant: 'beta' }, score: 70 },
          examples: [{ kind: 'seed', data: { ingested: true, tenant: 'beta' }, score: 70 }],
        },
        run: async (input, _context) => ({
          kind: 'seed',
          data: { ...input.data, ingested: true, tenant: 'beta' },
          score: 70,
        }),
      },
      {
        domain: 'beta',
        name: 'execute',
        kind: 'execute',
        id: 'studio-beta:execute:v1',
        namespace: 'studio:beta',
        title: 'Beta execute',
        description: 'short recovery chain',
        version: 'v1.0.0',
        tags: ['beta'],
        dependencies: [{ upstreamId: 'studio-beta:ingest:v1', optional: false, weight: 2 }],
        input: { schema: { kind: 'seed', data: { ingested: true, tenant: 'beta' } }, examples: [{ tenant: 'beta' }] },
        output: {
          schema: { kind: 'execution', data: { executed: true, lanes: 2 }, score: 90 },
          examples: [{ kind: 'execution', data: { executed: true, lanes: 2 }, score: 90 }],
        },
        run: async (input, _context) => ({
          kind: 'execution',
          data: { ...input.data, executed: true, lanes: 2 },
          score: 90,
        }),
      },
      {
        domain: 'beta',
        name: 'finalize',
        kind: 'finalize',
        id: 'studio-beta:finalize:v1',
        namespace: 'studio:beta',
        title: 'Beta finalize',
        description: 'final compact result',
        version: 'v1.0.0',
        tags: ['beta'],
        dependencies: [{ upstreamId: 'studio-beta:execute:v1', optional: true, weight: 1 }],
        input: { schema: { kind: 'execution', data: { executed: true } }, examples: [{ executed: true }] },
        output: { schema: { kind: 'result', data: { closed: true }, score: 95 }, examples: [{ kind: 'result', data: { closed: true }, score: 95 }] },
        run: async (input, _context) => ({
          kind: 'result',
          data: { ...input.data, closed: true },
          score: 92,
        }),
      },
    ],
    spec: {
      seed: 20002,
      parallelism: 2,
      strict: false,
      traceLevel: 'minimal',
    },
  },
] as const;

const normalizeWeights = (manifestSeed: typeof catalogSeed[number]): Readonly<Record<string, number>> =>
  STAGE_SEQUENCE.reduce<Record<string, number>>((acc, stage) => {
    acc[stage] = STAGE_ORDER[stage];
    return acc;
  }, {});

export const studioManifestCatalog = catalogSeed.map((entry) => ({
  tenantId: parseTenantId(entry.tenantId),
  workspaceId: parseWorkspaceId(entry.workspaceId),
  spec: entry.spec,
  pluginIds: entry.pluginIds as readonly PluginId[],
  pluginCatalog: entry.pluginCatalog as unknown as StudioManifestCatalog['pluginCatalog'],
  stageWeights: Object.entries(normalizeWeights(entry)).map(([stage, weight]) => ({ stage, weight })),
}));

export const resolveTenantManifest = (tenantId: string): StudioManifestCatalog | undefined =>
  studioManifestCatalog.find((entry) => entry.tenantId === tenantId);

export const resolveWorkspaceManifest = (
  tenantId: string,
  workspaceId: string,
): StudioManifestCatalog | undefined => {
  return studioManifestCatalog.find(
    (entry) => entry.tenantId === tenantId && entry.workspaceId === workspaceId,
  );
};

export const buildRuntimeContext = (tenantId: string, workspaceId: string) => {
  const catalog = resolveWorkspaceManifest(tenantId, workspaceId) ?? resolveTenantManifest(tenantId);
  if (!catalog) {
    throw new Error(`manifest-missing:${tenantId}:${workspaceId}`);
  }
  return {
    ...catalog,
    pluginCount: catalog.pluginCatalog.length,
  };
};
