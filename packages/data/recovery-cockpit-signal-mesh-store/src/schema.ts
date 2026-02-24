import { z } from 'zod';

export const MeshRecordNamespace = z
  .string()
  .min(3)
  .transform((value: string) => value.toLowerCase())
  .describe('Namespace used to isolate tenant mesh data.');

export const MeshStoreNodeSchema = z.object({
  nodeId: z.string().min(1),
  tenantId: z.string().min(1),
  regionId: z.string().min(1),
  phase: z.enum(['detect', 'assess', 'orchestrate', 'simulate', 'execute', 'observe', 'recover', 'settle']),
  health: z.number().min(0).max(100),
  signalCount: z.number().nonnegative(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const MeshStoreTopologySchema = z.object({
  runId: z.string().min(1),
  tenantId: z.string().min(1),
  namespace: MeshRecordNamespace,
  nodes: z.array(MeshStoreNodeSchema),
  edges: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      weight: z.number().min(0).max(1),
      policyIds: z.array(z.string()),
    }),
  ),
});

export const MeshStoreSignalSchema = z.object({
  signalId: z.string().min(1),
  tenantId: z.string().min(1),
  eventId: z.string().min(1),
  phase: z.enum(['detect', 'assess', 'orchestrate', 'simulate', 'execute', 'observe', 'recover', 'settle']),
  severity: z.enum(['trace', 'info', 'warn', 'critical']),
  riskBand: z.enum(['low', 'moderate', 'high', 'critical']),
  createdAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1),
  labels: z.array(z.string()),
  route: z.string(),
});

export const MeshStoreRecordSchema = z.object({
  schemaVersion: z.literal('v1'),
  namespace: MeshRecordNamespace,
  runId: z.string().min(1),
  tenantId: z.string().min(1),
  recordedAt: z.string().datetime(),
  topology: MeshStoreTopologySchema,
  events: z.array(MeshStoreSignalSchema),
});

export type MeshStoreRecord = z.infer<typeof MeshStoreRecordSchema>;
export type MeshStoreTopology = z.infer<typeof MeshStoreTopologySchema>;
export type MeshStoreSignal = z.infer<typeof MeshStoreSignalSchema>;

export const isRecordEnvelope = (value: unknown): value is MeshStoreRecord =>
  MeshStoreRecordSchema.safeParse(value).success;
