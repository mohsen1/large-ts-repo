import {
  type ArcanePlugin,
  type ArcanePluginContext,
  type ArcanePluginInputEnvelope,
  type ArcanePluginKind,
  type ArcanePluginManifest,
  type ArcanePluginResult,
  type CommandRunbookId,
  createChannelId,
  createPluginId,
  createRunId,
  createSessionId,
  createTenantId,
  createWorkspaceId,
  ensurePriority,
} from '../types';

const kindSeed = [
  'predictive',
  'decision',
  'playbook',
  'telemetry',
  'policy',
  'signal',
] as const satisfies readonly ArcanePluginKind[];

const commandIds = [
  ['signal-evict', 7, 4],
  ['policy-align', 14, 2],
  ['observe-shift', 31, 7],
  ['verify-plan', 12, 8],
] as const;

type ArcaneDemoPluginInput = ArcanePluginInputEnvelope<Record<string, unknown>>;
type ArcaneDemoPluginOutput = {
  readonly manifestId: string;
  readonly contextRunId: string;
  readonly inputSignalCount: number;
};

const createManifest = <TKind extends ArcanePluginKind>(
  tenantId: string,
  seed: {
    readonly kind: TKind;
    readonly index: number;
    readonly priority: number;
  },
): ArcanePluginManifest<TKind> => ({
  pluginId: createPluginId(`${tenantId}-${seed.kind}-${seed.index}`),
  tenantId: createTenantId(tenantId),
  name: `${seed.kind} executor ${seed.index + 1}`,
  kind: seed.kind,
  capabilities: [`${seed.kind}-core`, `${seed.kind}-control`],
  route: `observe/${seed.kind}/${seed.index % 2 === 0 ? 'core' : 'control'}`,
  phaseCoverage: ['observe', 'diagnose', 'isolate', 'restore', 'verify'],
  priority: ensurePriority(seed.priority),
  tags: {
    namespace: 'recovery-arcane',
    origin: seed.kind,
  },
  createdAt: new Date().toISOString(),
});

const toResult = (
  input: ArcaneDemoPluginInput,
  context: ArcanePluginContext,
  manifestId: string,
  seed: string,
): ArcanePluginResult<ArcaneDemoPluginOutput> => ({
  ok: true,
  value: {
    manifestId,
    contextRunId: context.runId,
    inputSignalCount: input.runbookIds.length,
  },
  diagnostics: [
    {
      code: `${seed}-started`,
      message: `manifest ${manifestId} for ${context.tenantId}`,
      severity: 'medium',
    },
  ],
  telemetry: {
    pluginId: createPluginId(manifestId),
    elapsedMs: 17 + seed.length * 4,
    traceId: createSessionId(`${context.runId}:template:${seed}`),
    attempts: [
      `${input.workspaceId}:attempt-${seed}` as CommandRunbookId,
      `${input.workspaceId}:attempt-${seed}-retry` as CommandRunbookId,
    ],
    latencyBand: 'p95',
  },
});

const buildPlugin = <TKind extends ArcanePluginKind>(
  tenantId: string,
  kind: TKind,
  index: number,
): ArcanePlugin<ArcaneDemoPluginInput, ArcaneDemoPluginOutput, TKind> => ({
  manifest: createManifest(tenantId, {
    kind,
    index,
    priority: ((index % 5) + 1) * 1,
  }),
  run: async (input, context) => {
    return toResult(input, context, `${tenantId}-${kind}-${index}`, `${kind}-${index}`);
  },
});

const toTemplateManifest = (tenantId: string): ArcanePluginManifest<'policy'> =>
  createManifest(tenantId, {
    kind: 'policy',
    index: 99,
    priority: 5,
  });

export const buildArcaneSampleCatalog = (tenantId: string): readonly ArcanePlugin[] => {
  const pluginMatrix = kindSeed.flatMap((kind, index) =>
    Array.from({ length: 2 }, (_entry, offset) => buildPlugin(tenantId, kind, index * 2 + offset)),
  );

  const templatePlugin: ArcanePlugin<ArcaneDemoPluginInput, ArcaneDemoPluginOutput, 'policy'> = {
    manifest: toTemplateManifest(tenantId),
    run: async (input, context) => {
      return {
        ok: true,
        diagnostics: [
          {
            code: 'policy-template',
            message: 'template plugin executed',
            severity: 'low',
          },
        ],
        telemetry: {
          pluginId: createPluginId(`${tenantId}-template-policy`),
          elapsedMs: 99,
          traceId: createSessionId(`${context.runId}:template`),
          attempts: ['policy-template-0' as CommandRunbookId, 'policy-template-1' as CommandRunbookId],
          latencyBand: 'p99',
        },
        value: {
          manifestId: `${tenantId}-template-policy`,
          contextRunId: context.runId,
          inputSignalCount: input.runbookIds.length,
        },
      };
    },
  };

  return [templatePlugin, ...pluginMatrix] as readonly ArcanePlugin[];
};

export const previewCatalogMeta = (tenantId: string): readonly [string, number][] => {
  const catalog = buildArcaneSampleCatalog(tenantId);
  return catalog.map((plugin) => [plugin.manifest.name, plugin.manifest.priority]);
};

export const buildSampleState = (tenantId: string): {
  readonly tenantId: ReturnType<typeof createTenantId>;
  readonly workspaceId: ReturnType<typeof createWorkspaceId>;
  readonly sessionId: ReturnType<typeof createSessionId>;
  readonly runId: ReturnType<typeof createRunId>;
  readonly channelId: ReturnType<typeof createChannelId>;
} => ({
  tenantId: createTenantId(tenantId),
  workspaceId: createWorkspaceId(`${tenantId}-workspace`),
  sessionId: createSessionId(`${tenantId}-session`),
  runId: createRunId(`${tenantId}-run`),
  channelId: createChannelId(tenantId),
});

export const commandSeedPairs = commandIds;
