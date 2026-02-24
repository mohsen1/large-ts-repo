import { z } from 'zod';

import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';

import type {
  MeshManifestEntry,
  MeshPolicyId,
  MeshRuntimeInput,
  MeshSemVer,
  MeshSignalClass,
} from './mesh-types';

const pluginNameSchema = z.string().regex(/^fusion-plugin:[a-z0-9-]+$/);
const semVerSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

const pluginEntrySchema = z.object({
  pluginId: z.string(),
  name: pluginNameSchema,
  version: semVerSchema.transform((value): MeshSemVer => value as MeshSemVer),
  versionLock: semVerSchema.transform((value): MeshSemVer => value as MeshSemVer),
  description: z.string().min(1),
  namespace: z.string().regex(/^mesh-[a-z0-9-]+$/),
  priority: z.number().min(0).max(5).transform((value) => value as 0 | 1 | 2 | 3 | 4 | 5),
  dependencies: z.array(pluginNameSchema),
  tags: z.array(z.enum(['critical', 'warning', 'baseline'] as const)).transform((values): MeshSignalClass[] => values),
});

const runManifestSchema = z.object({
  timestamp: z.string().datetime(),
  schemaVersion: z.literal('1.0').or(z.literal('2.0')),
  tenantId: z.string().uuid(),
  runId: z.string(),
  policyId: z.string(),
  plugins: z.array(pluginEntrySchema),
});

const metricSchema = z.object({
  count: z.number().int().nonnegative(),
  meanLatencyMs: z.number().nonnegative(),
  phase: z.string().regex(/^phase:/),
});

const runtimeInputSchema = z.object({
  phases: z.array(z.enum(['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'] as const)),
  nodes: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['source', 'transform', 'aggregator', 'sink']),
      score: z.number().min(0).max(1),
      phase: z.enum(['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'] as const),
      active: z.boolean(),
      metadata: z.record(z.unknown()),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      weight: z.number().min(0),
      latencyMs: z.number().nonnegative(),
      mandatory: z.boolean(),
    }),
  ),
  pluginIds: z.array(z.string()),
});

export const parseResultSchema = z.object({
  ok: z.boolean(),
  pluginPolicyId: z.string(),
  metric: metricSchema,
  runtimeInput: runtimeInputSchema,
});

export type MeshManifestSchema = z.infer<typeof runManifestSchema>;
export type MeshRuntimeSchemaInput = z.infer<typeof runtimeInputSchema>;

export const parseMeshPlugins = (value: unknown): Result<MeshManifestEntry[], Error> => {
  const parsed = z.array(pluginEntrySchema).safeParse(value);
  if (!parsed.success) {
    return fail(new Error(parsed.error.issues.map((issue) => issue.message).join('; ')));
  }
  return ok(parsed.data.map((entry) => ({ ...entry, tags: entry.tags as MeshSignalClass[] })));
};

export const parseMeshRuntimeInput = (value: unknown): Result<MeshRuntimeSchemaInput, Error> => {
  const parsed = runtimeInputSchema.safeParse(value);
  if (!parsed.success) {
    return fail(new Error(parsed.error.issues.map((issue) => issue.message).join('; ')));
  }
  return ok(parsed.data);
};

export const parseManifestRecord = (value: unknown): Result<MeshManifestSchema, Error> => {
  const parsed = runManifestSchema.safeParse(value);
  if (!parsed.success) {
    return fail(new Error(parsed.error.issues.map((issue) => issue.message).join('; ')));
  }
  return ok(parsed.data);
};

export const toRuntimeInput = (policyId: MeshPolicyId, schemaInput: MeshRuntimeSchemaInput): MeshRuntimeInput => ({
  phases: schemaInput.phases as const,
  nodes: schemaInput.nodes,
  edges: schemaInput.edges,
  pluginIds: schemaInput.pluginIds,
  tenant: policyId,
});

export const fallbackMeshRuntimeInput: MeshRuntimeSchemaInput = {
  phases: ['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'],
  nodes: [],
  edges: [],
  pluginIds: [],
};

export const bootstrapMeshManifest = runManifestSchema.parse({
  timestamp: new Date().toISOString(),
  schemaVersion: '1.0',
  tenantId: '00000000-0000-0000-0000-000000000000',
  runId: 'mesh-bootstrap',
  policyId: 'bootstrap-policy',
  plugins: [
    {
      pluginId: 'bootstrap-plugin',
      name: 'fusion-plugin:bootstrap',
      version: '1.0.0',
      versionLock: '1.0.0',
      description: 'bootstrap loader',
      namespace: 'mesh-bootstrap',
      priority: 3,
      dependencies: [],
      tags: ['baseline'],
    },
  ],
}) satisfies MeshManifestSchema;
