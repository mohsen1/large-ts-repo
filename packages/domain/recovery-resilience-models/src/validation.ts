import { z } from 'zod';
import { type MeshZone } from '@shared/recovery-ops-runtime';
import { severitySchema, type ScenarioPolicy } from './models';

const allowedZones = ['zone-east', 'zone-west', 'zone-core'] as const satisfies readonly MeshZone[];
const resilienceZoneSchema = z.enum(allowedZones);

export const policySchema = z.object({
  id: z.string().min(3),
  enabled: z.boolean(),
  zones: z.array(resilienceZoneSchema).min(1),
  threshold: z.number().min(0).max(1),
  channels: z.array(z.string()).min(1),
});

export const resilienceSettingsSchema = z.object({
  policy: policySchema,
  severityFloor: severitySchema,
});

export type ResiliencePolicyInput = z.infer<typeof resilienceSettingsSchema>;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string[] };

export const validatePolicy = (input: unknown): ValidationResult<ResiliencePolicyInput> => {
  const parsed = resilienceSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues.map((issue: { path: readonly (string | number)[]; message: string }) =>
        `${issue.path.join('.')}: ${issue.message}`,
      ),
    };
  }
  return {
    ok: true,
    value: parsed.data,
  };
};

export const validatePolicyZones = (
  policy: ScenarioPolicy,
  zones: readonly MeshZone[],
): ValidationResult<ScenarioPolicy> => {
  if (policy.targetZones.some((zone) => !zones.includes(zone as MeshZone))) {
    return {
      ok: false,
      reason: ['policy references unavailable target zone'],
    };
  }
  if (!policy.channels.length) {
    return {
      ok: false,
      reason: ['policy has no channels'],
    };
  }
  return {
    ok: true,
    value: policy,
  };
};

export const coerceConfidence = (input: number): number => {
  if (!Number.isFinite(input)) {
    return 0;
  }
  if (input <= 0) {
    return 0;
  }
  if (input >= 1) {
    return 1;
  }
  return Number(input.toFixed(4));
};

export const validateEnvelopeIds = (ids: readonly string[]): ValidationResult<readonly string[]> => {
  const invalid = ids.filter((value) => value.length < 2);
  if (invalid.length) {
    return {
      ok: false,
      reason: [`invalid ids: ${invalid.join(', ')}`],
    };
  }
  return {
    ok: true,
    value: ids,
  };
};
