import { z } from 'zod';

import {
  RecoveryConstraint,
  RecoveryMode,
  RecoveryPriority,
  RecoveryProgram,
  RecoveryStep,
  RecoveryTopology,
  RecoveryWindow,
} from './types';

type RecoveryProgramInput = Omit<RecoveryProgram, 'id' | 'tenant' | 'service'> & {
  id: string;
  tenant: string;
  service: string;
};

export const BrandIdSchema = z.string().min(1);

export const RecoveryWindowSchema: z.ZodType<RecoveryWindow> = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().min(1),
});

export const RecoveryTopologySchema: z.ZodType<RecoveryTopology> = z.object({
  rootServices: z.array(z.string()).min(1),
  fallbackServices: z.array(z.string()),
  immutableDependencies: z.array(z.tuple([z.string(), z.string()])),
});

export const RecoveryConstraintSchema: z.ZodType<RecoveryConstraint> = z.object({
  name: z.string().min(1),
  operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'ne']),
  threshold: z.number().finite(),
  description: z.string().min(1),
});

export const RecoveryStepSchema: z.ZodType<RecoveryStep> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  command: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  dependencies: z.array(z.string()),
  requiredApprovals: z.number().int().nonnegative(),
  tags: z.array(z.string()),
});

export const RecoveryProgramSchema: z.ZodType<RecoveryProgram, z.ZodTypeDef, RecoveryProgramInput> = z.object({
  id: BrandIdSchema.transform((value) => value as RecoveryProgram['id']),
  tenant: BrandIdSchema.transform((value) => value as RecoveryProgram['tenant']),
  service: BrandIdSchema.transform((value) => value as RecoveryProgram['service']),
  name: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['bronze', 'silver', 'gold', 'platinum']) as z.ZodType<RecoveryPriority>,
  mode: z.enum(['preventive', 'defensive', 'restorative', 'emergency']) as z.ZodType<RecoveryMode>,
  window: RecoveryWindowSchema,
  topology: RecoveryTopologySchema,
  constraints: z.array(RecoveryConstraintSchema),
  steps: z.array(RecoveryStepSchema).min(1),
  owner: z.string().min(1),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const parseRecoveryProgram = (value: unknown): RecoveryProgram => RecoveryProgramSchema.parse(value);
