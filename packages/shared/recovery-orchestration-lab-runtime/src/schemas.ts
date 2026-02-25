import { z } from 'zod';
import { runtimePrefixes, type RuntimePrefix, type WorkspaceId } from './ids.js';
import { asNodeId, type RuntimeTopology } from './topology.js';

const runtimePrefixSchema = z.enum(runtimePrefixes);

export const workspaceSchema = z.object({
  id: z.string().min(6),
  tenantId: z.string().min(3),
  region: z.string().min(2),
  createdAt: z.string().datetime(),
  tags: z.array(z.string()).default([]),
});

export const pluginContextSchema = z.object({
  tenant: z.string(),
  workspace: z.string(),
  runId: z.string(),
  startedAt: z.string().datetime(),
});

export const topologySchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      weight: z.number(),
      tags: z.array(z.string()),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      latencyMs: z.number().nonnegative(),
    }),
  ),
});

export const runEventSchema = z.object({
  topic: z.string(),
  runId: z.string(),
  payload: z.unknown(),
  emittedAt: z.string().datetime(),
});

export const sessionPayloadSchema = z.object({
  workspaceId: z.string(),
  runId: z.string(),
  tenant: z.string(),
  runtimePrefix: runtimePrefixSchema,
  topology: topologySchema,
});

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

export const assertWorkspaceId = (value: unknown): asserts value is WorkspaceId => {
  workspaceSchema.parse(value);
};

export const parseTopology = (value: unknown): RuntimeTopology => {
  const parsed = topologySchema.parse(value);
  const nodes = parsed.nodes.map((node) => ({
    id: asNodeId(node.id),
    tags: [...node.tags],
    weight: node.weight,
  }));
  const edges = parsed.edges.map((edge) => ({
    from: asNodeId(edge.from),
    to: asNodeId(edge.to),
    latencyMs: edge.latencyMs,
  }));
  return {
    nodes,
    edges,
  };
};

export const makeEventPayload = (
  runtimePrefix: RuntimePrefix,
  tenant: string,
  workspaceId: WorkspaceId,
) => {
  const payload = {
    topic: `${runtimePrefix}:event`,
    payload: {
      tenant,
      workspaceId,
      emittedAt: new Date().toISOString(),
    },
  };
  return runEventSchema.parse(payload);
};

export const wrapResult = (title: string, value: unknown) => {
  const parsed = sessionPayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${title}: ${parsed.error.message}`);
  }
  return parsed.data;
};
