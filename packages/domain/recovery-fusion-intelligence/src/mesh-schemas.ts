import { z } from 'zod';

import { fail, ok, type Result } from '@shared/result';
import {
  asMeshEventId,
  asMeshNodeId,
  asMeshPluginId,
  asMeshPolicyId,
  asMeshRunId,
  asSignalEnvelope,
  asMeshRuntimeMarker,
  type MeshManifestCatalog,
  type MeshManifestEntry,
  type MeshNode,
  type MeshEdge,
  type MeshRuntimeInput,
  type MeshSemVer,
  type MeshSignalClass,
  type MeshPhase,
  type MeshEventId,
  type MeshPluginName,
  type MeshPluginId,
  type MeshRunId,
} from './mesh-types';

const meshPhaseSchema = z.enum(['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'] as const).transform(
  (value) => value as MeshPhase,
);
const meshSignalClassSchema = z
  .enum(['critical', 'warning', 'baseline'] as const)
  .transform((value) => value as MeshSignalClass);

const pluginNameSchema = z
  .string()
  .regex(/^fusion-plugin:[a-z0-9-]+$/)
  .transform((value) => value as MeshPluginName);

const pluginIdSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asMeshPluginId(value));

const meshNamespaceSchema = z
  .string()
  .trim()
  .regex(/^mesh-[a-z0-9-]+$/)
  .transform((value) => value as `mesh-${string}`);

const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/)
  .transform((value) => value as MeshSemVer);

const prioritySchema = z.number().int().min(0).max(5).transform((value) => value as 0 | 1 | 2 | 3 | 4 | 5);
const pluginRoleSchema = z
  .enum(['source', 'transform', 'aggregator', 'sink'] as const)
  .transform((value) => value as MeshNode['role']);

const pluginEntrySchema = z.object({
  pluginId: pluginIdSchema,
  name: pluginNameSchema,
  version: semverSchema,
  versionLock: semverSchema,
  description: z.string().min(1),
  namespace: meshNamespaceSchema,
  priority: prioritySchema,
  dependencies: z.array(pluginNameSchema).default([]).readonly(),
  tags: z.array(meshSignalClassSchema).default(['baseline']).readonly(),
});

const manifestSchema = z.object({
  tenantId: z.string().uuid(),
  policyId: z.string().transform((value) => asMeshPolicyId(value)),
  runId: z.string().transform((value) => asMeshRunId('tenant', value)),
  timestamp: z.string().datetime(),
  schemaVersion: z.union([z.literal('1.0'), z.literal('2.0')]),
  plugins: z.array(pluginEntrySchema).readonly(),
});

const runtimeNodeSchema = z.object({
  id: z.string().transform((value) => asMeshNodeId(value)),
  role: pluginRoleSchema,
  score: z.number().min(0).max(1),
  phase: meshPhaseSchema,
  active: z.boolean(),
  metadata: z.record(z.unknown()).readonly(),
});

const runtimeEdgeSchema = z.object({
  from: z.string().transform((value) => asMeshNodeId(value)),
  to: z.string().transform((value) => asMeshNodeId(value)),
  weight: z.number().positive(),
  latencyMs: z.number().nonnegative(),
  mandatory: z.boolean(),
});

const runtimeInputSchema = z.object({
  phases: z.array(meshPhaseSchema).min(1).readonly(),
  nodes: z.array(runtimeNodeSchema).readonly(),
  edges: z.array(runtimeEdgeSchema).readonly(),
  pluginIds: z.array(pluginIdSchema).min(1).readonly(),
});

const manifestCatalogSchema = z.object({
  plugins: z.array(pluginEntrySchema).readonly(),
  tenantId: z.string().uuid(),
  policyId: z.string().transform((value) => asMeshPolicyId(value)),
  runId: z.string().transform((value) => asMeshRunId('tenant', value)),
  timestamp: z.string().datetime(),
  schemaVersion: z.union([z.literal('1.0'), z.literal('2.0')]),
});

const collectManifestErrors = (issues: ReadonlyArray<{ message: string }>): string =>
  issues.map((issue) => issue.message).join('; ');

const freezeCatalog = (catalog: MeshManifestCatalog): MeshManifestCatalog => ({
  ...catalog,
  plugins: Object.freeze([...catalog.plugins]),
});

const freezeRuntimeInput = (runtimeInput: MeshRuntimeInput): MeshRuntimeInput => ({
  ...runtimeInput,
  nodes: Object.freeze([...runtimeInput.nodes]),
  edges: Object.freeze([...runtimeInput.edges]),
  pluginIds: Object.freeze([...runtimeInput.pluginIds]),
  phases: Object.freeze([...runtimeInput.phases]),
});

const coercePluginId = (pluginId: MeshPluginId): MeshPluginId => pluginId;
const normalizePluginSeed = (value: MeshManifestCatalog): MeshManifestCatalog => ({
  ...value,
  plugins: value.plugins.map((entry) => ({
    ...entry,
    tags: entry.tags.length === 0 ? ['baseline'] : entry.tags,
    dependencies: entry.dependencies ?? [],
    namespace: entry.namespace as `mesh-${string}`,
  })),
});

export type MeshManifestSchema = z.infer<typeof manifestSchema>;
export type MeshRuntimeInputSchema = z.infer<typeof runtimeInputSchema>;

export const parseMeshPlugins = (value: unknown): Result<MeshManifestCatalog, Error> => {
  const parsed = manifestCatalogSchema.safeParse(value);
  if (!parsed.success) {
    return fail(new Error(collectManifestErrors(parsed.error.issues)));
  }
  return ok(freezeCatalog(normalizePluginSeed(parsed.data)));
};

export const parseManifestRecord = (value: unknown): Result<MeshManifestCatalog, Error> => {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) {
    return fail(new Error(collectManifestErrors(parsed.error.issues)));
  }

  const catalog = freezeCatalog({
    ...parsed.data,
    runId: asMeshRunId('tenant', String(parsed.data.runId).split(':').at(-1) ?? 'bootstrap'),
  });

  return ok(catalog);
};

export const parseMeshRuntimeInput = (value: unknown): Result<MeshRuntimeInput, Error> => {
  const parsed = runtimeInputSchema.safeParse(value);
  if (!parsed.success) {
    return fail(new Error(collectManifestErrors(parsed.error.issues)));
  }

  return ok(
    freezeRuntimeInput({
      phases: parsed.data.phases,
      nodes: parsed.data.nodes,
      edges: parsed.data.edges,
      pluginIds: parsed.data.pluginIds,
    }),
  );
};

export const fallbackMeshRuntimeInput: MeshRuntimeInput = freezeRuntimeInput({
  phases: ['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'],
  nodes: [
    {
      id: asMeshNodeId('bootstrap-source'),
      role: 'source',
      score: 0.95,
      phase: 'ingest',
      active: true,
      metadata: { seed: 'fallback' },
    },
    {
      id: asMeshNodeId('bootstrap-sink'),
      role: 'sink',
      score: 0.7,
      phase: 'execute',
      active: true,
      metadata: { seed: 'fallback' },
    },
  ],
  edges: [
    {
      from: asMeshNodeId('bootstrap-source'),
      to: asMeshNodeId('bootstrap-sink'),
      weight: 1,
      latencyMs: 128,
      mandatory: true,
    },
  ],
  pluginIds: [asMeshPluginId('bootstrap-plugin')],
});

export const bootstrapMeshManifest: MeshManifestCatalog = {
  tenantId: '00000000-0000-0000-0000-000000000000',
  policyId: asMeshPolicyId('policy-bootstrap'),
  runId: asMeshRunId('tenant', 'bootstrap'),
  schemaVersion: '1.0',
  timestamp: new Date().toISOString(),
  plugins: [
    {
      pluginId: coercePluginId(asMeshPluginId('bootstrap-plugin')),
      name: 'fusion-plugin:bootstrap',
      version: '1.0.0' as MeshSemVer,
      versionLock: '1.0.0' as MeshSemVer,
      description: 'bootstrap loader',
      namespace: 'mesh-bootstrap',
      priority: 3,
      dependencies: [],
      tags: ['baseline'],
    },
  ],
};

export const fallbackMeshRuntimeSignal = (runId: MeshRunId, index: number): MeshEventId =>
  asMeshEventId(runId, 'ingest', index);

export const parseResultSchema = z.object({
  ok: z.boolean(),
  pluginPolicyId: z.string(),
  metricCount: z.number().nonnegative(),
  runtimeInput: runtimeInputSchema,
});

type RuntimeSeedNode = {
  readonly id: string;
  readonly role: MeshNode['role'];
  readonly score: number;
  readonly phase: MeshPhase;
  readonly active: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
};

type RuntimeSeedEdge = {
  readonly from: string;
  readonly to: string;
  readonly weight: number;
  readonly latencyMs: number;
  readonly mandatory: boolean;
};

type RuntimeSeed = {
  readonly phases: readonly MeshPhase[];
  readonly pluginIds: readonly string[];
  readonly nodes: readonly RuntimeSeedNode[];
  readonly edges: readonly RuntimeSeedEdge[];
};

export const toRuntimeInput = (seed: RuntimeSeed): MeshRuntimeInput =>
  freezeRuntimeInput({
    phases: seed.phases,
    pluginIds: seed.pluginIds.map(asMeshPluginId),
    nodes: seed.nodes.map((node) => ({
      id: asMeshNodeId(node.id),
      role: node.role,
      score: Math.max(0, Math.min(1, Number.isFinite(node.score) ? node.score : 0)),
      phase: node.phase,
      active: node.active,
      metadata: node.metadata,
    })),
    edges: seed.edges.map((edge) => ({
      from: asMeshNodeId(edge.from),
      to: asMeshNodeId(edge.to),
      weight: Number.isFinite(edge.weight) ? Math.max(0.01, edge.weight) : 0.1,
      latencyMs: Math.max(0, edge.latencyMs),
      mandatory: edge.mandatory,
    })),
  });

export const makeSignal = (runId: MeshRunId, phase: MeshPhase): MeshRuntimeInput => ({
  phases: ['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'],
  nodes: [
    {
      id: asMeshNodeId(`${runId}:source`),
      role: 'source',
      score: 0.9,
      phase,
      active: true,
      metadata: { kind: 'bootstrap-signal', tag: 'runtime' },
    },
  ],
  edges: [],
  pluginIds: [asMeshPluginId('seed-plugin')],
});

export const meshSignalKind = (runId: MeshRunId, phase: MeshPhase) =>
  asSignalEnvelope({
    runId,
    phase,
    source: asMeshNodeId('bootstrap-source'),
    class: 'baseline',
    severity: 0,
    payload: {
      event: `runtime:${runId}`,
      createdBy: 'mesh-schemas',
      marker: asMeshRuntimeMarker(phase),
    },
  });
