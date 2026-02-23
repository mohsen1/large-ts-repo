import { z } from 'zod';
import {
  CadenceWindowState,
  CadenceIntensity,
  CadenceRisk,
  CadenceChannel,
  CadenceTemplate,
  CadencePlan,
  CadenceIntent,
  CadenceWindow,
  CadenceWindowId,
  CadencePlanId,
  CadenceIntentId,
  CadenceConstraint,
} from './types';

export const isoDate = z.string().datetime({ offset: true });

export const cadenceWindowStateSchema = z.enum([
  'planned',
  'queued',
  'active',
  'degraded',
  'completed',
  'terminated',
] as const);

export const cadenceIntensitySchema = z.enum(['low', 'medium', 'high', 'critical'] as const);
export const cadenceRiskSchema = z.enum(['minimal', 'elevated', 'significant', 'critical'] as const);
export const cadenceChannelSchema = z.enum(['compute', 'network', 'storage', 'fabric', 'control'] as const);

export const cadenceWindowTagSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  namespace: z.enum(['service', 'owner', 'environment', 'team'] as const),
});

export const cadenceWindowSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  channel: cadenceChannelSchema,
  name: z.string().min(1),
  owner: z.string().min(1),
  startAt: isoDate,
  endAt: isoDate,
  leadMinutes: z.number().nonnegative(),
  lagMinutes: z.number().nonnegative(),
  intensity: cadenceIntensitySchema,
  state: cadenceWindowStateSchema as z.ZodType<CadenceWindowState>,
  risk: cadenceRiskSchema,
  tags: z.array(cadenceWindowTagSchema),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const cadenceTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  channel: cadenceChannelSchema,
  windows: z.array(cadenceWindowSchema.omit({ id: true, planId: true, createdAt: true, updatedAt: true })),
  defaultIntensity: cadenceIntensitySchema as z.ZodType<CadenceIntensity>,
  createdBy: z.string().min(1),
  checksum: z.string().min(8),
});

export const cadencePlanSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  displayName: z.string().min(3),
  templateId: z.string().min(1),
  status: z.enum(['draft', 'active', 'paused', 'archived']),
  owner: z.string().min(1),
  objective: z.object({
    target: z.string().min(1),
    constraints: z.array(z.string()),
  }),
  windows: z.array(cadenceWindowSchema),
  intentIds: z.array(z.string().min(1)),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const cadenceIntentSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  requestedAt: isoDate,
  requestedBy: z.string().min(1),
  requestedWindowId: z.string().min(1),
  rationale: z.string().min(4),
  expectedOutcome: z.string().min(4),
  urgency: cadenceIntensitySchema,
  metadata: z.record(z.string(), z.string()),
});

export const cadenceConstraintSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  windowId: z.string().min(1),
  maxLagMinutes: z.number().nonnegative(),
  maxLeadMinutes: z.number().nonnegative(),
  maxConcurrentWindows: z.number().int().positive(),
  allowedChannels: z.array(cadenceChannelSchema),
  forbidOverlapWithIntents: z.array(z.string().min(1)),
});

const toCadenceWindowId = (value: string): CadenceWindowId => value as CadenceWindowId;
const toCadencePlanId = (value: string): CadencePlanId => value as CadencePlanId;
const toCadenceIntentId = (value: string): CadenceIntentId => value as CadenceIntentId;
const toCadenceTemplateId = (value: string): CadenceTemplate['id'] => value as CadenceTemplate['id'];
const toCadenceChannel = (value: CadenceChannel): CadenceChannel => value;

export const parseCadenceWindow = (input: unknown): CadenceWindow => {
  const parsed = cadenceWindowSchema.parse(input);
  return {
    ...parsed,
    id: toCadenceWindowId(parsed.id),
    planId: toCadencePlanId(parsed.planId),
    channel: toCadenceChannel(parsed.channel),
    tags: parsed.tags,
  };
};

export const parseCadencePlan = (input: unknown): CadencePlan => {
  const parsed = cadencePlanSchema.parse(input);
  return {
    ...parsed,
    id: toCadencePlanId(parsed.id),
    templateId: toCadenceTemplateId(parsed.templateId),
    windows: parsed.windows.map((window) => ({
      ...parseCadenceWindow(window),
      planId: toCadencePlanId(window.planId),
    })),
    intentIds: parsed.intentIds.map((intentId) => toCadenceIntentId(intentId)),
  };
};

export const parseCadenceIntent = (input: unknown): CadenceIntent => {
  const parsed = cadenceIntentSchema.parse(input);
  return {
    ...parsed,
    id: toCadenceIntentId(parsed.id),
    planId: toCadencePlanId(parsed.planId),
    requestedWindowId: toCadenceWindowId(parsed.requestedWindowId),
  };
};

export const parseCadenceTemplate = (input: unknown): CadenceTemplate => {
  const parsed = cadenceTemplateSchema.parse(input);
  return {
    ...parsed,
    id: toCadenceTemplateId(parsed.id),
    windows: parsed.windows.map((window) => ({
      ...window,
      intensity: window.intensity,
      channel: toCadenceChannel(window.channel),
    })),
    checksum: parsed.checksum as CadenceTemplate['checksum'],
    defaultIntensity: parsed.defaultIntensity,
  };
};

export const parseCadenceConstraint = (input: unknown): CadenceConstraint => {
  const parsed = cadenceConstraintSchema.parse(input);
  return {
    ...parsed,
    id: parsed.id as CadenceConstraint['id'],
    planId: toCadencePlanId(parsed.planId),
    windowId: toCadenceWindowId(parsed.windowId),
    forbidOverlapWithIntents: parsed.forbidOverlapWithIntents.map((id) => toCadenceIntentId(id)),
    allowedChannels: parsed.allowedChannels.map(toCadenceChannel),
  };
};

export type ParsedCadenceConstraint = CadenceConstraint;
