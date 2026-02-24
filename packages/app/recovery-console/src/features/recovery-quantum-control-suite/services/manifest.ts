import { z } from 'zod';
import type { PluginSeed, QuantumInput, QuantumOutput, QuantumRunId, QuantumStageName, QuantumTenantId } from '../types';
import { makeRunId, makeTenantId, makeStage } from '../types';

const signalMetaSchema = z.object({
  id: z.string().startsWith('signal-'),
  tenant: z.string().startsWith('tenant-'),
  timestamp: z.string(),
  kind: z.enum(['policy', 'signal', 'control', 'metric']),
  weight: z.enum(['critical', 'high', 'medium', 'low']),
  actor: z.string(),
  channel: z.string(),
  note: z.string(),
});

const signalEnvelopeSchema = z.object({
  id: z.string().startsWith('envelope-'),
  runId: z.string().startsWith('run-'),
  recordedAt: z.string(),
  values: z.array(signalMetaSchema),
});

const outputSchema = z.object({
  runId: z.string().startsWith('run-'),
  executedAt: z.string(),
  summary: z.string().startsWith('summary:'),
  stages: z.array(
    z.object({
      stage: z.string().startsWith('stage:'),
      stageRunId: z.string().startsWith('run-'),
      directives: z.array(
        z.object({
          id: z.string().startsWith('directive:'),
          command: z.enum(['throttle', 'reroute', 'synchronize', 'freeze']),
          reason: z.string(),
          priority: z.number().min(0),
          dependencies: z.array(z.string()),
          expiresAt: z.string().optional(),
        }),
      ),
      artifactPayload: z.record(z.union([z.string(), z.number(), z.boolean()])),
    }),
  ),
  directives: z.array(
    z.object({
      id: z.string().startsWith('directive:'),
      command: z.enum(['throttle', 'reroute', 'synchronize', 'freeze']),
      reason: z.string(),
      priority: z.number().min(0),
      dependencies: z.array(z.string()),
      expiresAt: z.string().optional(),
    }),
  ),
  status: z.enum(['ok', 'warn', 'error']),
});

const pluginSeedSchema = z.object({
  name: z.string().startsWith('plugin:'),
  namespace: z.string().startsWith('namespace:'),
  version: z.string().regex(/^v\d+\.\d+$/),
  tags: z.array(z.string().startsWith('tag:')),
  dependsOn: z.array(z.string().startsWith('plugin:')).default([]),
  description: z.string().min(1),
});

const planSeedSchema = z.object({
  shape: z.enum(['linear', 'mesh', 'adaptive']),
  stage: z.string().startsWith('stage:'),
  budgetMs: z.number().min(1),
});

export type PluginSeedRecord = z.infer<typeof pluginSeedSchema>;
export type RawManifest = z.infer<typeof planSeedSchema>;

const pluginSeedToDomain = (seed: PluginSeedRecord): PluginSeed => ({
  name: seed.name as `plugin:${string}`,
  namespace: seed.namespace as `namespace:${string}`,
  version: seed.version as `v${number}.${number}`,
  tags: seed.tags as readonly (`tag:${string}`)[],
  dependsOn: seed.dependsOn as readonly (`plugin:${string}`)[],
  description: seed.description,
});

export const parseSignalEnvelope = (payload: unknown): QuantumInput['signals'] => {
  const parsed = signalEnvelopeSchema.parse(payload);
  return {
    id: `envelope-${parsed.runId}` as const,
    runId: makeRunId(parsed.runId),
    recordedAt: parsed.recordedAt,
    values: parsed.values.map((entry) => ({
      id: entry.id as `signal-${string}`,
      tenant: makeTenantId(entry.tenant),
      timestamp: entry.timestamp,
      kind: entry.kind,
      weight: entry.weight,
      actor: entry.actor,
      channel: entry.channel,
      note: entry.note,
    })),
  };
};

export const parseQuantumOutput = (payload: unknown): QuantumOutput => {
  const parsed = outputSchema.parse(payload);
  return {
    runId: makeRunId(parsed.runId),
    executedAt: parsed.executedAt,
    summary: parsed.summary as `summary:${string}`,
    stages: parsed.stages.map((stage) => ({
      stage: stage.stage as QuantumStageName,
      stageRunId: makeRunId(stage.stageRunId),
      directives: stage.directives.map((directive) => ({
        id: directive.id as `directive:${string}`,
        command: directive.command,
        reason: directive.reason,
        priority: directive.priority,
        dependencies: directive.dependencies,
        expiresAt: directive.expiresAt,
      })),
      artifactPayload: stage.artifactPayload,
    })),
    directives: parsed.directives.map((directive) => ({
      id: directive.id as `directive:${string}`,
      command: directive.command,
      reason: directive.reason,
      priority: directive.priority,
      dependencies: directive.dependencies,
      expiresAt: directive.expiresAt,
    })),
    status: parsed.status,
  };
};

export const parseQuantumInput = (payload: unknown, tenant: QuantumTenantId): QuantumInput => {
  const parsed = planSeedSchema.parse(payload);
  const runId = makeRunId(`run-${Date.now()}`);
  return {
    runId,
    tenant,
    shape: parsed.shape,
    stage: makeStage('seeded'),
    signals: {
      id: `envelope-${runId}`,
      runId,
      recordedAt: new Date().toISOString(),
      values: [],
    },
    budgetMs: parsed.budgetMs ?? 250,
  };
};

export const rawPluginSeeds: PluginSeedRecord[] = pluginSeedSchema.array().parse([
  {
    name: 'plugin:signal-normalizer',
    namespace: 'namespace:quantum-suite',
    version: 'v1.0',
    tags: ['tag:normalize'],
    dependsOn: [],
    description: 'Normalize and canonicalize incoming signals.',
  },
  {
    name: 'plugin:policy-synthesis',
    namespace: 'namespace:quantum-suite',
    version: 'v1.1',
    tags: ['tag:policy'],
    dependsOn: ['plugin:signal-normalizer'],
    description: 'Build policy directives for the orchestration stage.',
  },
  {
    name: 'plugin:telemetry-emit',
    namespace: 'namespace:quantum-suite',
    version: 'v1.3',
    tags: ['tag:telemetry'],
    dependsOn: ['plugin:policy-synthesis'],
    description: 'Emit summary and telemetry artifacts.',
  },
]) as PluginSeedRecord[];

export const seedManifests = rawPluginSeeds.map(pluginSeedToDomain);
