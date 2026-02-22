import { z } from 'zod';

import type {
  ComparisonCondition,
  ConditionExpression,
  JsonFieldPath,
  RecoveryAction,
  PolicyValue,
  RecoveryPolicy,
  RecoveryPolicyMode,
  RecoveryPolicyRule,
  RecoveryPolicySeverity,
} from './types';

const PolicyModeSchema = z.enum(['advisory', 'mandatory', 'blocking']) as z.ZodType<RecoveryPolicyMode>;
const PolicySeveritySchema = z.enum(['info', 'warn', 'error', 'critical']) as z.ZodType<RecoveryPolicySeverity>;
const PolicyActionSchema = z.enum(['pause', 'throttle', 'retry', 'escalate', 'abort', 'force-progress']) as z.ZodType<RecoveryAction>;
const PrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const PolicyValueSchema: z.ZodType<PolicyValue> = z.union([
  PrimitiveSchema,
  z.array(PrimitiveSchema),
  z.record(z.string(), PrimitiveSchema),
]);

const PathSchema = z.string() as z.ZodType<JsonFieldPath>;

const ComparisonSchema: z.ZodType<ComparisonCondition> = z.object({
  operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'notIn', 'exists']),
  path: PathSchema,
  value: PolicyValueSchema,
});

const TruthySchema = z.object({ is: z.boolean() });

const ConditionSchema: z.ZodType<ConditionExpression> = z.lazy(() =>
  z.union([
    ComparisonSchema,
    z.object({ not: ConditionSchema }),
    z.object({ all: z.array(ConditionSchema).min(1) }),
    z.object({ any: z.array(ConditionSchema).min(1) }),
    TruthySchema,
  ]) as z.ZodType<ConditionExpression>
);

const PolicyEffectSchema = z.object({
  action: PolicyActionSchema,
  reason: z.string().min(1),
  pauseMs: z.number().int().nonnegative().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  escalationRoute: z.string().optional(),
});

const PolicyRuleSchema: z.ZodType<RecoveryPolicyRule> = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().finite(),
  condition: ConditionSchema,
  effects: z.array(PolicyEffectSchema).min(1),
});

const RecoveryPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  mode: PolicyModeSchema,
  severity: PolicySeveritySchema,
  version: z.string().regex(/^v\\d+$/),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  scope: z.object({
    tenant: z.string().optional(),
    services: z.array(z.string()).optional(),
    priorities: z.array(z.string()).optional(),
    programs: z.array(z.string()).optional(),
  }),
  rules: z.array(PolicyRuleSchema).min(1),
  owner: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).transform((value) => ({
  ...value,
  id: value.id as RecoveryPolicy['id'],
  version: value.version as RecoveryPolicy['version'],
  scope: {
    ...value.scope,
    tenant: value.scope.tenant as RecoveryPolicy['scope']['tenant'] | undefined,
    services: value.scope.services as RecoveryPolicy['scope']['services'] | undefined,
    priorities: value.scope.priorities as RecoveryPolicy['scope']['priorities'] | undefined,
    programs: value.scope.programs as RecoveryPolicy['scope']['programs'] | undefined,
  },
  tags: [...new Set(value.tags)] as RecoveryPolicy['tags'],
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
}));

const RecoveryPolicyCollectionSchema = z.array(RecoveryPolicySchema).min(0);

export const parseRecoveryPolicy = (value: unknown): RecoveryPolicy => RecoveryPolicySchema.parse(value);
export const parseRecoveryPolicies = (value: unknown): RecoveryPolicy[] => RecoveryPolicyCollectionSchema.parse(value);
export const conditionSchema = ConditionSchema;
export const policySchema = RecoveryPolicySchema;
