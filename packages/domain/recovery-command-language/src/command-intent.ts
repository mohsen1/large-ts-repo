import { z } from 'zod';

export interface CommandIntentMeta {
  sourceService: string;
  reasonCode: string;
  createdAt: Date;
  requestedBy: string;
  expectedImpactMins?: number;
}

export const commandIntentIdSchema = z.string().uuid();
export const commandIntentSchema = z.object({
  id: commandIntentIdSchema,
  label: z.string().min(3),
  description: z.string().max(400),
  priority: z.number().int().min(0).max(10),
  confidenceScore: z.number().min(0).max(1),
  owner: z.string().min(1),
  payload: z.record(z.unknown()),
  tags: z.array(z.string()).default([]),
  metadata: z.object({
    sourceService: z.string(),
    reasonCode: z.string(),
    createdAt: z.string().datetime(),
    requestedBy: z.string(),
    expectedImpactMins: z.number().int().nonnegative().optional(),
  }),
});

export type CommandIntent = z.infer<typeof commandIntentSchema>;

export type CommandIntentEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> =
  Omit<CommandIntent, 'payload'> & {
    payload: TPayload;
  };

export type PriorityBand = 'low' | 'normal' | 'high' | 'critical';

export function classifyPriority(score: number): PriorityBand {
  if (score < 3) {
    return 'low';
  }
  if (score < 6) {
    return 'normal';
  }
  if (score < 9) {
    return 'high';
  }
  return 'critical';
}

export interface IntentCorrelation {
  groupId: string;
  parentIntentId?: string;
  relatedIntentIds: readonly string[];
}

export interface IntentContext {
  operation: 'failover' | 'scale' | 'drill' | 'diagnostic' | 'recovery';
  region: string;
  environment: 'prod' | 'staging' | 'dev';
  affectedAssets: string[];
  correlation?: IntentCorrelation;
}

export const intentContextSchema = z.object({
  operation: z.enum(['failover', 'scale', 'drill', 'diagnostic', 'recovery']),
  region: z.string().min(1),
  environment: z.enum(['prod', 'staging', 'dev']),
  affectedAssets: z.array(z.string()).default([]),
  correlation: z
    .object({
      groupId: z.string(),
      parentIntentId: z.string().uuid().optional(),
      relatedIntentIds: z.array(z.string().uuid()),
    })
    .optional(),
});

export interface IntentRoute {
  namespace: string;
  route: string;
  slaWindowMinutes: number;
  constraints: string[];
}

export const intentRouteSchema = z.object({
  namespace: z.string(),
  route: z.string().min(3),
  slaWindowMinutes: z.number().int().nonnegative(),
  constraints: z.array(z.string()).default([]),
});

export function normalizeIntentIntent<T extends Record<string, unknown>>(
  intent: CommandIntentEnvelope<T>,
): CommandIntentEnvelope<T> {
  return {
    ...intent,
    tags: intent.metadata.reasonCode ? [intent.metadata.reasonCode, ...intent.tags] : intent.tags,
  };
}
