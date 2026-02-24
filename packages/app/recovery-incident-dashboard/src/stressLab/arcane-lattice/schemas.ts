import { z } from 'zod';
import {
  createPluginId,
  createRouteNamespace,
  createRunId,
  createSessionId,
  createTenantId,
  createWorkspaceId,
  type ArcaneManifest,
  type ArcaneNamespace,
  type ArcanePlugin,
  type ArcanePluginKind,
  type ArcanePluginManifest,
  type ArcaneWorkspaceConfig,
  type ArcaneWorkspaceState,
  type TenantId,
  type ArcaneWorkspaceId,
  type ArcaneRoute,
  type ArcaneChannelId,
  type ArcaneTenantId,
  type ArcaneSessionId,
} from './types';

export const ArcanePluginKindSchema = z.union([
  z.literal('predictive'),
  z.literal('decision'),
  z.literal('playbook'),
  z.literal('telemetry'),
  z.literal('policy'),
  z.literal('signal'),
]) as z.ZodType<ArcanePluginKind>;

const namespaceSchema = z
  .string()
  .min(3)
  .transform((value) => createRouteNamespace(value));

const tenantIdSchema = z.string().min(2).transform((value) => createTenantId(value));

const runbookIdSchema = z
  .string()
  .min(2)
  .transform((value) => `${value}-runbook` as `${string}`);

const workspaceStateSchema = z.object({
  tenantId: tenantIdSchema,
  workspaceId: z.string().min(3).transform((value) => createWorkspaceId(value)),
  namespace: namespaceSchema,
  windowSizeMinutes: z.number().int().min(1).max(720),
  allowAutoRetry: z.boolean(),
  includeForecasts: z.boolean(),
});

const pluginManifestSchema = z.object({
  pluginId: z.string().min(3),
  tenantId: tenantIdSchema,
  name: z.string().min(3),
  kind: ArcanePluginKindSchema,
  capabilities: z.array(z.string().min(3)),
  route: z.string().regex(/^(observe|diagnose|plan|isolate|restore|verify)\/(predictive|decision|playbook|telemetry|policy|signal)\/.+$/),
  phaseCoverage: z.array(z.string()),
  priority: z.number().int().min(1).max(5),
  tags: z.record(z.string(), z.string()),
  createdAt: z.string().datetime(),
});

const manifestSchema = z.object({
  namespace: namespaceSchema,
  namespaceRoute: z
    .string()
    .regex(/^(observe|diagnose|plan|isolate|restore|verify)\/(predictive|decision|playbook|telemetry|policy|signal)\/.+$/),
  workspaceId: z.string().transform((value) => createWorkspaceId(value)),
  createdAt: z.string().datetime(),
  pluginKindOrder: z.array(ArcanePluginKindSchema),
  pluginCountHint: z.number().int().min(1).max(5000),
  defaultPriority: z.number().int().min(1).max(5),
  tags: z.record(z.string(), z.string()),
  tagsByKind: z.array(
    z.object({
      kind: ArcanePluginKindSchema,
      capability: z.string().min(4),
    }),
  ),
  plugins: z.array(pluginManifestSchema),
  workspaceConfig: workspaceStateSchema,
});

export type ArcaneManifestShape = z.input<typeof manifestSchema>;

export const isArcaneKind = (value: string): value is ArcanePluginKind => {
  const result = ArcanePluginKindSchema.safeParse(value);
  return result.success;
};

const pluginKindList = ['predictive', 'decision', 'playbook', 'telemetry', 'policy', 'signal'] as const satisfies readonly ArcanePluginKind[];

const manifestDefaults = {
  namespace: createRouteNamespace('recovery-arcane-lab'),
  namespaceRoute: 'observe/predictive/core',
  workspaceId: 'arcane-default',
  createdAt: new Date().toISOString(),
  pluginKindOrder: [...pluginKindList],
  pluginCountHint: 12,
  defaultPriority: 3,
  tags: {
    environment: 'synthetic',
    domain: 'incident-orchestration',
  },
  tagsByKind: [
    { kind: 'predictive' as const, capability: 'predictive-core' },
    { kind: 'decision' as const, capability: 'decision-control' },
    { kind: 'policy' as const, capability: 'policy-edge' },
    { kind: 'signal' as const, capability: 'signal-audit' },
  ],
  plugins: [
  {
      pluginId: 'arcane-policy-sentinel',
      tenantId: 'tenant-arcane',
      name: 'Policy Sentinel',
      kind: 'policy',
      capabilities: ['policy-core', 'policy-control'],
      route: 'observe/policy/control',
      phaseCoverage: ['observe', 'isolate', 'verify', 'restore'],
      priority: 5,
      tags: {
        surface: 'policy',
      },
      createdAt: new Date().toISOString(),
    },
    {
      pluginId: 'arcane-signal-router',
      tenantId: 'tenant-arcane',
      name: 'Signal Router',
      kind: 'signal',
      capabilities: ['signal-core', 'signal-edge'],
      route: 'observe/signal/control',
      phaseCoverage: ['observe', 'diagnose', 'verify'],
      priority: 3,
      tags: {
        surface: 'signal',
      },
      createdAt: new Date().toISOString(),
    },
  ],
  workspaceConfig: {
    tenantId: 'tenant-arcane',
    workspaceId: 'arcane-default',
    namespace: 'recovery-arcane-lab',
    windowSizeMinutes: 30,
    allowAutoRetry: true,
    includeForecasts: true,
  },
} as const;

const toRoute = (value: string): ArcaneRoute => value as ArcaneRoute;

export const parseManifest = (raw: unknown): ArcaneManifestShape => manifestSchema.parse(raw);

export const parsePluginManifest = (raw: unknown): ArcanePluginManifest => {
  const parsed = pluginManifestSchema.parse(raw) as {
    pluginId: string;
    tenantId: string;
    name: string;
    kind: ArcanePluginKind;
    capabilities: readonly string[];
    route: string;
    phaseCoverage: readonly string[];
    priority: number;
    tags: Readonly<Record<string, string>>;
    createdAt: string;
  };

  return {
    pluginId: createPluginId(parsed.pluginId),
    tenantId: createTenantId(parsed.tenantId),
    name: parsed.name,
    kind: parsed.kind,
    capabilities: parsed.capabilities as ArcanePluginManifest['capabilities'],
    route: toRoute(parsed.route),
    phaseCoverage: parsed.phaseCoverage as ArcanePluginManifest['phaseCoverage'],
    priority: parsed.priority as 1 | 2 | 3 | 4 | 5,
    tags: parsed.tags,
    createdAt: parsed.createdAt,
  };
};

export const manifestSeed = parseManifest(manifestDefaults);

export const asArcaneWorkspaceState = (seed: ArcaneManifestShape): ArcaneWorkspaceState => {
  const workspace = {
    tenantId: createTenantId(seed.workspaceConfig.tenantId as string),
    workspaceId: createWorkspaceId(seed.workspaceConfig.workspaceId as string),
    namespace: createRouteNamespace(seed.namespace),
    runId: createRunId(`${seed.namespace}-run`),
    sessionId: createSessionId(`${seed.namespace}-session`),
    status: 'idle',
    namespaceRoute: seed.namespaceRoute,
    config: {
      tenantId: createTenantId(seed.workspaceConfig.tenantId as string),
      workspaceId: createWorkspaceId(seed.workspaceConfig.workspaceId as string),
      namespace: createRouteNamespace(seed.workspaceConfig.namespace as string),
      windowSizeMinutes: seed.workspaceConfig.windowSizeMinutes,
      allowAutoRetry: seed.workspaceConfig.allowAutoRetry,
      includeForecasts: seed.workspaceConfig.includeForecasts,
    },
    signalIds: [],
    runbookIds: [],
    selectedPluginKinds: [...seed.pluginKindOrder],
    createdAt: seed.createdAt,
  } satisfies ArcaneWorkspaceState;

  return workspace;
};

export const extractPluginSeed = (seed: ArcaneManifestShape): readonly ArcanePluginManifest[] =>
  seed.plugins.map((plugin) => parsePluginManifest(plugin));

export const castManifestByKind = <T extends ArcanePluginKind>(
  manifest: ArcaneManifestShape,
  kind: T,
): readonly ArcanePluginManifest[] =>
  manifest.plugins
    .filter((plugin) => plugin.kind === kind)
    .map((plugin) => parsePluginManifest(plugin));
