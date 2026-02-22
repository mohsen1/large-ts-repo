import { z } from 'zod';
import type {
  ProgramId,
  IncidentSeverity,
  RecoveryScenario,
  SignalFingerprint,
  ScenarioConstraint,
  RecoveryState,
  TenantId,
  ScenarioId,
} from './types';

const SignalSchema = z.object({
  metric: z.string(),
  value: z.number(),
  unit: z.string(),
  dimension: z.record(z.string(), z.string()),
  observedAt: z.string().datetime(),
});

const ConstraintSchema = z.object({
  key: z.string(),
  operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'ne']),
  threshold: z.number(),
  windowMinutes: z.number().int().positive(),
});

const SeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical'] as const);
const StateSchema = z.enum(['idle', 'triage', 'active', 'cooldown', 'resolved', 'quarantined'] as const);

const ActionSchema = z.object({
  code: z.string().min(1),
  owner: z.string().min(1),
  command: z.string().min(1),
  requiredApprovals: z.number().int().nonnegative(),
  estimatedMinutes: z.number().positive(),
  tags: z.array(z.string()),
});

export const RecoveryScenarioInputSchema = z.object({
  tenantId: z.string().min(1),
  programId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  severity: SeveritySchema,
  state: StateSchema.default('idle'),
  constraints: z.array(ConstraintSchema),
  actions: z.array(ActionSchema),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const parseScenarioInput = (input: unknown): RecoveryScenario => {
  const parsed = RecoveryScenarioInputSchema.parse(input) as unknown as Omit<RecoveryScenario, 'id'> & {
    createdAt?: string;
    updatedAt?: string;
  };
  const id = `${parsed.tenantId}:${parsed.programId}` as ScenarioIdFromRuntime;
  return {
    ...parsed,
    tenantId: parsed.tenantId as TenantId,
    programId: parsed.programId as ProgramId,
    id,
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
  };
};

type ScenarioIdFromRuntime = RecoveryScenario['id'];

export const decodeSignals = (input: readonly unknown[]): SignalFingerprint[] =>
  input
    .map((value) => SignalSchema.safeParse(value))
    .filter((entry): entry is { success: true; data: SignalSchemaResult } => entry.success)
    .map((entry) => ({
      ...entry.data,
      observedAt: entry.data.observedAt,
    }));

export const isConstraintViolated = (constraint: ScenarioConstraint, signal: SignalFingerprint): boolean => {
  if (constraint.key !== signal.metric) return false;
  const value = signal.value;
  switch (constraint.operator) {
    case 'lt':
      return value < constraint.threshold;
    case 'lte':
      return value <= constraint.threshold;
    case 'gt':
      return value > constraint.threshold;
    case 'gte':
      return value >= constraint.threshold;
    case 'eq':
      return value === constraint.threshold;
    case 'ne':
      return value !== constraint.threshold;
    default:
      return false;
  }
};

export const normalizeSeverities = (values: readonly (string | IncidentSeverity)[]): IncidentSeverity[] =>
  values
    .map((item) => (typeof item === 'string' ? item : `${item}`))
    .filter((item) => ['info', 'low', 'medium', 'high', 'critical'].includes(item)) as IncidentSeverity[];

export const normalizeRuntimeState = (value: unknown): RecoveryState => {
  if (value === 'triage' || value === 'active' || value === 'cooldown' || value === 'resolved' || value === 'quarantined' || value === 'idle') {
    return value;
  }
  return 'idle';
};

type SignalSchemaResult = {
  metric: string;
  value: number;
  unit: string;
  dimension: Record<string, string>;
  observedAt: string;
};
