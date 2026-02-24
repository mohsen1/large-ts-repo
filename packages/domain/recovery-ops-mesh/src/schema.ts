import { withBrand } from '@shared/core';
import { z } from 'zod';
import {
  meshKindPrefix,
  type MeshNodeContract,
  type MeshNodeId,
  type MeshNodeKind,
  type MeshPayloadFor,
  type MeshPlanId,
  type MeshSignalKind,
  type MeshTopology,
  type MeshTopologyPath,
  type MeshId,
} from './types';

const MeshKindSchema = z.enum(['ingest', 'transform', 'emit', 'observer'] as const);
const MeshSignalSchema = z.enum(['pulse', 'snapshot', 'alert', 'telemetry'] as const);
const MeshPrioritySchema = z.enum(['low', 'normal', 'high', 'critical'] as const);

const meshIdSchema = z.string().min(1);

export const meshNodeContractSchema = z.object({
  id: meshIdSchema,
  label: z.string().min(1).max(120),
  kind: MeshKindSchema,
  tags: z.array(z.string()),
  priority: MeshPrioritySchema,
  maxConcurrency: z.number().int().min(1).max(128),
  schemaVersion: z.string().regex(/^v\d+\.\d+$/),
  payload: z.record(z.string(), z.unknown()),
});

export const meshLinkSchema = z.object({
  id: meshIdSchema,
  from: meshIdSchema,
  to: meshIdSchema,
  weight: z.number().min(0).max(1),
  channels: z.array(z.string().min(1)),
  retryLimit: z.number().int().min(0).max(10),
});

export const meshTopologySchema = z.object({
  id: meshIdSchema,
  name: z.string().min(2),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  nodes: z.array(meshNodeContractSchema),
  links: z.array(meshLinkSchema),
  createdAt: z.number().int().positive(),
});

export const meshRunContextSchema = z.object({
  planId: meshIdSchema,
  runId: meshIdSchema,
  startedAt: z.number().int().positive(),
  clock: z.object({
    epoch: z.bigint(),
    skewMicros: z.number(),
  }),
  user: z.string(),
  tenant: z.string(),
  locale: z.string(),
});

export const meshPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pulse'), payload: z.object({ value: z.number() }) }),
  z.object({ kind: z.literal('snapshot'), payload: meshTopologySchema }),
  z.object({ kind: z.literal('alert'), payload: z.object({ severity: MeshPrioritySchema, reason: z.string().max(240) }) }),
  z.object({ kind: z.literal('telemetry'), payload: z.record(z.string(), z.number()) }),
]);

export const meshEnvelopeSchema = z.object({
  id: z.string(),
  kind: MeshSignalSchema,
  kindKey: z.string().refine((value) => value.startsWith(meshKindPrefix), {
    message: 'kindKey must start with mesh:',
  }),
  occurredAt: z.number().positive(),
  payload: z.unknown(),
  trace: z.string(),
  sourceNode: meshIdSchema,
});

export const meshRuntimeConfigSchema = z.object({
  namespace: z.string().regex(/^mesh\./),
  pluginKeys: z.array(z.string()),
  maxInflight: z.number().int().min(1).max(64),
  includeHistory: z.boolean(),
});

export const meshRuntimeConfig = {
  namespace: `${meshKindPrefix}runtime`,
  pluginKeys: [],
  maxInflight: 16,
  includeHistory: true,
} as const satisfies ReturnType<typeof meshRuntimeConfigSchema.parse>;

const asMeshNodeId = (value: string): MeshNodeId => withBrand(value, 'MeshNodeId');
const asMeshPlanId = (value: string): MeshPlanId => withBrand(value, 'MeshPlanId');
const asMeshTopologyLinkId = (value: string): MeshTopology['links'][number]['id'] => withBrand(value, 'MeshLinkId');

type ParsedNodeContract = ReturnType<typeof meshNodeContractSchema.parse>;
type ParsedTopologyLink = ReturnType<typeof meshLinkSchema.parse>;
type ParsedTopology = ReturnType<typeof meshTopologySchema.parse>;

const normalizeTopologyVersion = (value: string): `${number}.${number}.${number}` => {
  if (/^\d+\.\d+\.\d+$/.test(value)) {
    return value as `${number}.${number}.${number}`;
  }
  return '1.0.0';
};

const normalizeNodeSchema = (value: string): `${number}.${number}` => {
  if (/^v\d+\.\d+$/.test(value)) {
    return value as `${number}.${number}`;
  }
  return '1.0';
};

const normalizeNodePayload = (kind: MeshNodeKind, rawPayload: Record<string, unknown>): MeshNodeContract['payload'] => {
  switch (kind) {
    case 'ingest':
      return {
        source: typeof rawPayload.source === 'string' ? rawPayload.source : 'source-unset',
      } as unknown as MeshNodeContract['payload'];
    case 'transform':
      return {
        mapping:
          rawPayload.mapping && typeof rawPayload.mapping === 'object'
            ? (rawPayload.mapping as Record<string, string>)
            : {},
      } as unknown as MeshNodeContract['payload'];
    case 'emit':
      return {
        targets:
          Array.isArray(rawPayload.targets) && rawPayload.targets.every((entry) => typeof entry === 'string')
            ? (rawPayload.targets as readonly string[])
            : [],
      } as unknown as MeshNodeContract['payload'];
    case 'observer':
      return {
        probes:
          Array.isArray(rawPayload.probes) && rawPayload.probes.every((entry) => typeof entry === 'string')
            ? (rawPayload.probes as readonly string[])
            : [],
      } as unknown as MeshNodeContract['payload'];
    default:
      return {
        probes: [],
      } as unknown as MeshNodeContract['payload'];
  }
};

const normalizeTopology = (topology: ParsedTopology): MeshTopology => {
  const nodes = topology.nodes.map((node: ParsedNodeContract) => ({
    ...node,
    id: asMeshNodeId(node.id),
    kind: node.kind,
    tags: [...node.tags] as readonly string[],
    payload: normalizeNodePayload(node.kind, node.payload),
    schemaVersion: normalizeNodeSchema(node.schemaVersion),
    maxConcurrency: Math.max(1, Math.min(128, node.maxConcurrency)),
  }));

  const links = topology.links.map((link: ParsedTopologyLink) => ({
    ...link,
    id: asMeshTopologyLinkId(link.id),
    from: asMeshNodeId(link.from),
    to: asMeshNodeId(link.to),
    weight: Math.max(0, Math.min(1, link.weight)),
    retryLimit: Math.max(0, Math.min(10, link.retryLimit)),
  }));

  return {
    ...topology,
    id: asMeshPlanId(topology.id),
    version: normalizeTopologyVersion(topology.version),
    nodes: nodes as MeshTopology['nodes'],
    links: links as MeshTopology['links'],
  };
};

export const parseTopology = (value: unknown): MeshTopology => normalizeTopology(meshTopologySchema.parse(value));
export const parseContext = (value: unknown) => meshRunContextSchema.parse(value);
export const parsePayload = (value: unknown) => meshPayloadSchema.parse(value);
export const parseEnvelope = (value: unknown) => meshEnvelopeSchema.parse(value);

export const parseRuntimeConfig = (value: unknown) => meshRuntimeConfigSchema.parse(value);

export const resolveNodeKind = (input: { kind: string }) => {
  const parsed = MeshKindSchema.parse(input.kind);
  return parsed as MeshNodeKind;
};

export const parseNodeId = (value: unknown): MeshNodeId => {
  if (typeof value === 'string') {
    return asMeshNodeId(value);
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string'
  ) {
    return asMeshNodeId((value as { id: string }).id);
  }

  return asMeshNodeId(String(value));
};

export const parsePlanId = (value: unknown): MeshPlanId => {
  if (typeof value === 'string') {
    return asMeshPlanId(value);
  }

  return asMeshPlanId(`plan-${String(value)}`);
};

export const parseMeshId = <TKind extends 'MeshNode' | 'MeshPlan' | 'MeshLink' | 'MeshRun'>(
  value: unknown,
  kind: TKind,
): MeshId<TKind> => withBrand(typeof value === 'string' ? value : String(value), `${kind}Id` as const);

export const parseTopologyPath = (value: string): MeshTopologyPath => {
  return (value.length > 0 ? value : 'boot') as MeshTopologyPath;
};

export const parseOrThrowSignal = <TSignal extends MeshSignalKind>(
  signal: TSignal,
  payload: unknown,
): MeshPayloadFor<TSignal> => {
  return meshPayloadSchema.parse({ kind: signal, payload }) as MeshPayloadFor<TSignal>;
};

export const isAlertPayload = (
  payload: MeshPayloadFor<MeshSignalKind>,
): payload is Extract<MeshPayloadFor<MeshSignalKind>, { kind: 'alert' }> => payload.kind === 'alert';

export const meshEnvelopeFromSignal = (
  id: MeshPlanId,
  sourceNode: MeshNodeId,
  signal: MeshPayloadFor<MeshSignalKind>,
): ReturnType<typeof meshEnvelopeSchema.parse> => {
  return meshEnvelopeSchema.parse({
    id: id as unknown as string,
    kind: signal.kind,
    kindKey: `${meshKindPrefix}${signal.kind}`,
    occurredAt: Date.now(),
    payload: signal.payload,
    trace: `trace:${String(id)}`,
    sourceNode,
  });
};
