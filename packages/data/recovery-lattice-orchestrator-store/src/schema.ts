import { z } from 'zod';

const signalLevel = z.enum(['critical', 'elevated', 'normal', 'low']);

export const latticeSignalSchema = z.object({
  tenantId: z.string().min(1),
  zoneId: z.string().min(1),
  streamId: z.string().min(1),
  level: signalLevel,
  score: z.number().finite().gte(0).lte(1),
  at: z.string().min(1),
  details: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

export const latticeEnvelopeSchema = z.object({
  runId: z.string().min(8),
  signal: latticeSignalSchema,
  metadata: z.record(z.string()),
});

export const latticeBatchSchema = z.object({
  tenantId: z.string().min(1),
  streamId: z.string().min(1),
  topology: z.record(z.unknown()),
  records: z.array(latticeSignalSchema),
  tags: z.array(z.string()).optional(),
});

export const latticeQuerySchema = z.object({
  tenantId: z.string().optional(),
  streamId: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

export type LatticeSignalSchemaInput = z.input<typeof latticeSignalSchema>;
export type LatticeSignalSchemaOutput = z.output<typeof latticeSignalSchema>;
export type LatticeBatchInput = z.input<typeof latticeBatchSchema>;
export type LatticeBatchOutput = z.output<typeof latticeBatchSchema>;

export const validateSignal = (value: unknown): LatticeSignalSchemaOutput => latticeSignalSchema.parse(value);
export const safeValidateSignal = (value: unknown) => latticeSignalSchema.safeParse(value);

export const signalSeed = [
  {
    tenantId: 'tenant://alpha',
    zoneId: 'zone://primary',
    streamId: 'stream://recovery-lattice',
    level: 'normal',
    score: 0.4,
    at: new Date().toISOString(),
    details: {
      source: 'bootstrap',
      reason: 'seed',
    },
  },
  {
    tenantId: 'tenant://alpha',
    zoneId: 'zone://primary',
    streamId: 'stream://recovery-lattice',
    level: 'low',
    score: 0.2,
    at: new Date().toISOString(),
    details: {
      source: 'bootstrap',
      reason: 'initial',
    },
  },
] as const satisfies readonly LatticeSignalSchemaOutput[];

export const LATTICE_SCHEMA_VERSION = 'lattice-schema-v1' as const;
