import { z } from 'zod';
import type { SurfaceRun, SurfacePlan, SurfacePolicy, SurfaceRun as SurfaceRunAlias, SurfaceSignal } from './types';
import { buildSurfaceRunId } from './types';

export const surfaceIdSchema = z
  .string()
  .min(6, 'Surface identifiers should include a tenant and command context');

export const signalSchema = z.object({
  key: z.string().min(1),
  value: z.number().finite(),
  unit: z.enum(['ms', 'percent', 'count', 'ratio', 'unknown']),
  timestamp: z.string().datetime(),
});

export const planSchema = z.object({
  tenant: z.string().min(3),
  region: z.string().min(2),
  zone: z.string().min(1),
  accountId: z.string().min(6),
});

export const runSchema = z.object({
  id: z.string(),
  tenant: z.string(),
  scenario: z.string(),
  requestedBy: z.string(),
  state: z.enum(['pending', 'scheduled', 'in_flight', 'validated', 'completed', 'failed', 'rolled_back']),
});

export const policySchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  rules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      appliesToKind: z.array(z.enum(['stabilize', 'reroute', 'quarantine', 'rollback', 'verify'])),
      maxRiskThreshold: z.number().min(0).max(100),
      minSignalRatio: z.number().min(0).max(1),
      recommendedWindowMinutes: z.number().min(1),
    }),
  ),
});

export const validatePlan = (plan: SurfacePlan): { ok: boolean; reason?: string } => {
  if (!plan.commands.length) {
    return { ok: false, reason: 'plan needs at least one command' };
  }
  if (plan.constraints.maxInFlight <= 0) {
    return { ok: false, reason: 'maxInFlight must be positive' };
  }
  if (plan.commands.length < plan.dependencies.length + 1) {
    return { ok: false, reason: 'dependency edges exceed command count' };
  }
  const invalidTargets = plan.dependencies.some((dependency) =>
    dependency.from === dependency.to,
  );
  if (invalidTargets) {
    return { ok: false, reason: 'self dependency detected' };
  }
  return { ok: true };
};

export const validatePolicy = (policy: SurfacePolicy): { ok: boolean; detail?: string } => {
  if (!policy.enabled && policy.rules.length > 0) {
    return { ok: true, detail: 'policy disabled but rules retained for audit history' };
  }
  if (policy.enabled && policy.rules.length === 0) {
    return { ok: false, detail: 'enabled policy must include rules' };
  }
  return { ok: true };
};

export const validateRun = (run: SurfaceRun): { ok: boolean; detail: string } => {
  if (!run.steps.length) {
    return { ok: true, detail: 'empty run' };
  }
  if (run.riskScore < 0) {
    return { ok: false, detail: 'negative risk score' };
  }
  return { ok: true, detail: 'valid run' };
};

export const ensureSignalEnvelope = (signal: unknown): SurfaceSignal => {
  const parsed = signalSchema.parse(signal);
  return {
    key: parsed.key,
    value: parsed.value,
    unit: parsed.unit,
    timestamp: parsed.timestamp,
  };
};

export const materializePlanId = (tenant: string, zone: string): string => {
  return `${tenant.toLowerCase().trim()}:${zone.toLowerCase().trim()}:${Date.now()}`;
};

export const materializeRunId = (planId: string): SurfaceRunAlias['id'] =>
  buildSurfaceRunId(planId as any, `run-${Date.now()}`);

export const guardPlan = (value: unknown): SurfacePlan => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('invalid plan payload');
  }
  const parsed = z.object({
    id: z.string(),
    name: z.string(),
    surface: planSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    commands: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        kind: z.enum(['stabilize', 'reroute', 'quarantine', 'rollback', 'verify']),
        instructions: z.array(z.string()),
        inputs: z.array(z.object({
          command: z.string(),
          arguments: z.record(z.unknown()),
          priority: z.number(),
          expectedDurationMinutes: z.number().min(0),
        })),
        safetyTags: z.array(z.string()),
        requiresApproval: z.boolean(),
      }),
    ),
    dependencies: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        latencyMs: z.number().min(0),
        requiredReadiness: z.number().min(0).max(1),
      }),
    ),
    constraints: z.object({
      maxInFlight: z.number().min(1),
      maxRisk: z.number().min(0),
      allowedDowntimeMinutes: z.number().min(1),
    }),
  }).parse(value) as unknown as SurfacePlan;
  return parsed;
};
