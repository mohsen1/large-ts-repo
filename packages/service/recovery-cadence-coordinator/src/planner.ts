import { z } from 'zod';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import {
  buildPlanDraft,
  CadencePlan,
  CadenceWindow,
  CadenceConstraint,
  CadenceIntent,
  CadenceWindowId,
  CadenceId,
  clampIntensity,
  summarizePlan,
  validatePlan,
} from '@domain/recovery-cadence-orchestration';
import type { CadenceCoordinatorConfig, CadenceCoordinatorError } from './types';

const planIntentSchema = z.object({
  organizationId: z.string().min(1),
  owner: z.string().min(1),
  channel: z.enum(['compute', 'network', 'storage', 'fabric', 'control']),
  requestedWindowCount: z.number().int().min(1).max(24),
  maxConcurrentWindows: z.number().int().min(1).max(100),
  intensity: z.enum(['low', 'medium', 'high', 'critical']),
});

export const validateCoordinatorConfig = (config: unknown): Result<CadenceCoordinatorConfig, CadenceCoordinatorError> => {
  const parsed = planIntentSchema.safeParse(config);
  if (!parsed.success) {
    return fail({ code: 'validation', message: 'Invalid coordinator config', details: parsed.error.flatten() });
  }

  return ok({
    orgId: parsed.data.organizationId,
    owner: parsed.data.owner,
    timezone: 'UTC',
    maxActiveWindowCount: parsed.data.maxConcurrentWindows,
  });
};

const pickIntensity = (source: string): CadenceIntent['urgency'] => {
  if (source === 'critical' || source === 'high' || source === 'medium' || source === 'low') {
    return source;
  }
  return 'medium';
};

const inferState = (index: number): CadenceWindow['state'] => (index === 0 ? 'queued' : 'planned');

const inferRisk = (index: number): CadenceWindow['risk'] => {
  if (index === 0) return 'elevated';
  if (index % 4 === 0) return 'significant';
  return 'minimal';
};

const toTemplateId = (cadenceId: CadenceId): CadencePlan['templateId'] => cadenceId as unknown as CadencePlan['templateId'];

export interface PlanBuildArtifacts {
  plan: CadencePlan;
  windows: readonly CadenceWindow[];
  intents: readonly CadenceIntent[];
  constraints: readonly CadenceConstraint[];
}

export const buildPlanArtifacts = (
  config: CadenceCoordinatorConfig,
): Result<PlanBuildArtifacts, CadenceCoordinatorError> => {
  const draft = buildPlanDraft({
    organizationId: config.orgId,
    owner: config.owner,
    channel: 'compute',
    requestedWindowCount: 6,
    maxConcurrentWindows: config.maxActiveWindowCount,
    intensity: clampIntensity('medium'),
  });

  const windows = draft.draftWindows.map((window, index): CadenceWindow => ({
    id: window.id,
    planId: draft.planId,
    channel: window.channel,
    name: window.name,
    owner: window.owner,
    startAt: window.startAt,
    endAt: new Date(Date.parse(window.startAt) + window.durationMinutes * 60 * 1000).toISOString(),
    leadMinutes: window.durationMinutes,
    lagMinutes: Math.max(2, index),
    intensity: pickIntensity(window.intensity),
    state: inferState(index),
    risk: inferRisk(index),
    tags: [
      { key: 'index', value: String(index + 1), namespace: 'service' },
      { key: 'seed', value: draft.cadenceId, namespace: 'team' },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  const constraints: CadenceConstraint[] = draft.constraints.map((item, index) => ({
    id: item.id,
    planId: item.planId,
    windowId: item.windowId,
    maxLeadMinutes: item.maxLeadMinutes,
    maxLagMinutes: item.maxLagMinutes,
    maxConcurrentWindows: Math.max(1, config.maxActiveWindowCount - 1),
    allowedChannels: [item.allowedChannels[0], 'network'],
    forbidOverlapWithIntents: item.forbidOverlapWithIntents,
  }));

  const plan: CadencePlan = {
    id: draft.planId,
    organizationId: config.orgId,
    displayName: `${config.owner} Cadence`,
    templateId: toTemplateId(draft.cadenceId),
    status: 'draft',
    owner: config.owner,
    objective: {
      target: 'Balance burst response with recovery stability',
      constraints: ['no critical overlap with existing runs', 'preserve queue depth'],
    },
    windows,
    intentIds: draft.intentSeed.map((intent) => intent.id),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const planValidation = validatePlan(plan, draft.intentSeed, constraints);
  if (!planValidation.ok) {
    return fail({ code: 'validation', message: 'Plan validation failed', details: planValidation.issues });
  }

  const summary = summarizePlan(plan, constraints);
  if (summary.aggregateRisk === 'critical' && config.maxActiveWindowCount < 2) {
    return fail({ code: 'saturation', message: 'Risk is critical for low-capacity coordinator', details: summary });
  }

  const windowIds = new Set(windows.map((window) => window.id));
  if (windowIds.size !== windows.length) {
    return fail({ code: 'constraint', message: 'Duplicate windows produced while planning' });
  }

  return ok({
    plan,
    windows,
    intents: draft.intentSeed,
    constraints,
  });
};
