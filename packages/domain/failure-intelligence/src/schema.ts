import { z } from 'zod';
import { brandFrom } from '@shared/validation';
import { type FailureSignal, type FailureActionPlan, createFailureSignalIdentity, createSignalTags, type SignalShape, type Severity } from './models';
import type { Primitive } from '@shared/type-level';

const tenantBrand = brandFrom(z.string().min(3), 'TenantId');
const shapeSchema = z.enum(['latency', 'error-rate', 'availability', 'capacity', 'security']);
const severitySchema = z.enum(['p0', 'p1', 'p2', 'p3']);

export const FailureSignalInputSchema = z.object({
  source: z.string().min(1),
  tenantId: z.string(),
  shape: shapeSchema,
  component: z.string().min(1),
  severity: severitySchema,
  message: z.string().max(1_000),
  context: z.object({
    region: z.string(),
    environment: z.enum(['prod', 'staging', 'canary']),
    service: z.string().min(1),
    host: z.string().optional(),
    owner: z.string().optional(),
  }),
  payload: z.record(z.union([z.string(), z.number(), z.boolean(), z.bigint(), z.symbol(), z.null()])),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

export const FailureActionPlanSchema = z.object({
  tenantId: z.string(),
  signalIds: z.array(z.string()),
  fingerprint: z.object({
    tenantId: z.string(),
    component: z.string(),
    rootCause: z.string(),
    score: z.number().min(0).max(1),
    severity: z.enum(['low', 'moderate', 'high', 'critical']),
  }),
  actions: z.array(
    z.object({
      id: z.string(),
      action: z.enum(['mitigate', 'isolate', 'throttle', 'patch', 'fallback', 'page', 'ignore']),
      reason: z.string(),
      confidence: z.number().min(0).max(1),
      runbook: z.string().optional(),
      args: z.record(z.unknown()).optional(),
    }),
  ),
  owner: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
});

export const normalizeSignal = (raw: unknown): FailureSignal | undefined => {
  const parsed = FailureSignalInputSchema.safeParse(raw);
  if (!parsed.success) return;

  const tenantIdResult = tenantBrand.parse(parsed.data.tenantId);
  if (!tenantIdResult.ok) return;
  const tenantId = tenantIdResult.value;
  const occurredAt = parsed.data.occurredAt ?? new Date().toISOString();
  const signalInput = { ...parsed.data, tenantId, occurredAt };

  return {
    id: createFailureSignalIdentity(signalInput),
    source: parsed.data.source as any,
    tenantId,
    shape: parsed.data.shape as SignalShape,
    component: parsed.data.component,
    severity: parsed.data.severity as Severity,
    message: parsed.data.message,
    context: signalInput.context,
    payload: signalInput.payload as Record<string, Primitive>,
    createdAt: new Date().toISOString(),
    occurredAt,
    history: [Date.parse(occurredAt)],
    tags: createSignalTags(parsed.data.severity as Severity, parsed.data.shape as SignalShape, parsed.data.component).map((tag) => tag.name),
  };
};

export const normalizePlan = (raw: unknown): FailureActionPlan | undefined => {
  const parsed = FailureActionPlanSchema.safeParse(raw);
  if (!parsed.success) return;

  const tenantIdResult = tenantBrand.parse(parsed.data.tenantId);
  if (!tenantIdResult.ok) return;
  const tenantId = tenantIdResult.value;
  const fingerprintTenantIdResult = tenantBrand.parse(parsed.data.fingerprint.tenantId);
  if (!fingerprintTenantIdResult.ok) return;

  return {
    id: `plan-${Date.now()}` as any,
    tenantId,
    signalIds: parsed.data.signalIds as Array<any>,
    fingerprint: {
      ...parsed.data.fingerprint,
      tenantId: fingerprintTenantIdResult.value,
    },
    actions: parsed.data.actions as any,
    owner: parsed.data.owner,
    createdAt: parsed.data.createdAt,
    expiresAt: parsed.data.expiresAt,
  };
};
