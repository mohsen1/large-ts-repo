import { z } from 'zod';
import { withBrand } from '@shared/core';
import {
  PHASE_SEQUENCE,
  normalizePlanSequence,
  makeTenantId,
  makeExperimentId,
  makeRunId,
  makePlanId,
  makeSeed,
  makeSignalChannel,
  makePlanSignature,
  buildNodeId,
  type ExperimentContext,
  type ExperimentPayload,
  type ExperimentIntent,
  type ExperimentPlan,
  type PlanDraft,
  type ExperimentPhase,
  type ExperimentRunId,
  type SignalChannel,
} from './types';

const phaseSchema = z.enum(PHASE_SEQUENCE);

const contextSchema = z.object({
  issuer: z.string().min(2),
  tenantId: z.string().min(3),
  tenantLabel: z.string().min(2),
  namespace: z.string().min(3),
  activePhases: z.array(phaseSchema).default([...PHASE_SEQUENCE]),
  signal: z.string().min(1),
});

const payloadSchema = z.object({
  strategy: z.string().min(3),
  horizonMinutes: z.number().int().min(1).max(20_000),
  metadata: z.record(z.unknown()),
  channels: z.array(z.string().min(1)).min(1),
});

const nodeSchema = z.object({
  nodeId: z.string().min(1),
  name: z.string().min(2),
  phase: phaseSchema,
  dependencies: z.array(z.string().min(1)).default([]),
  score: z.number().min(0).max(1),
  metadata: z.record(z.unknown()),
});

const draftSchema = z.object({
  draftId: z.string().min(1),
  tenant: z.string().min(2),
  namespace: z.string().min(3),
  candidateNodes: z.array(nodeSchema).default([]),
  targetPhases: z.array(phaseSchema).default([...PHASE_SEQUENCE]),
  createdAt: z.string().min(1),
});

const planSchema = z.object({
  planId: z.string().min(4),
  tenant: z.string().min(2),
  sequence: z.array(phaseSchema).min(1),
  graph: z.array(nodeSchema).default([]),
  payload: payloadSchema,
  createdAt: z.string().min(1),
  createdBy: z.string().min(1),
  signature: z.string().default(''),
  version: z.number().int().min(1),
});

const intentSchema = z.object({
  experimentId: z.string().min(4),
  runId: z.string().min(4),
  phase: phaseSchema,
  seed: z.string().min(4),
  tags: z.array(z.string()).default([]),
  source: z.string(),
  owner: z.string().min(3),
  tenantId: z.string().min(2),
  createdAt: z.string().min(1),
});

export const parseExperimentContext = (payload: unknown): ExperimentContext => {
  const parsed = contextSchema.parse(payload);
  const tenantId = makeTenantId(parsed.tenantId);
  return {
    issuer: withBrand(parsed.issuer, 'ExperimentIssuer'),
    tenantId,
    tenantLabel: parsed.tenantLabel,
    namespace: `autonomy:${parsed.tenantId}`,
    activePhases: normalizePlanSequence(parsed.activePhases),
    signal: makeSignalChannel(makeRunId(makeTenantId(parsed.tenantId), 'context')) as SignalChannel,
  };
};

export const parseExperimentPayload = (payload: unknown): ExperimentPayload => {
  const parsed = payloadSchema.parse(payload);
  return {
    strategy: parsed.strategy,
    horizonMinutes: parsed.horizonMinutes,
    metadata: parsed.metadata,
    channels: parsed.channels as readonly SignalChannel[],
  };
};

export const parseExperimentIntent = (payload: unknown): ExperimentIntent => {
  const parsed = intentSchema.parse(payload);
  const phase = phaseSchema.parse(parsed.phase) as ExperimentPhase;
  return {
    experimentId: makeExperimentId(makeTenantId(parsed.tenantId), parsed.experimentId),
    runId: makeRunId(makeTenantId(parsed.tenantId), parsed.runId),
    phase,
    seed: makeSeed(parsed.seed),
    tags: parsed.tags.map((tag) => withBrand(tag, 'ExperimentTag')),
    source: `pilot-${phase}`,
    owner: parsed.owner,
    tenantId: makeTenantId(parsed.tenantId),
    createdAt: parsed.createdAt,
  };
};

export const parsePlanDraft = (payload: unknown): PlanDraft => {
  const parsed = draftSchema.parse(payload);
  return {
    draftId: withBrand(parsed.draftId, 'PlanDraftId'),
    tenant: makeTenantId(parsed.tenant),
    namespace: `autonomy:${parsed.tenant}`,
    candidateNodes: parsed.candidateNodes.map((node) => ({
      ...node,
      metadata: node.metadata,
      nodeId: withBrand(node.nodeId, 'ExperimentNodeId'),
      dependencies: node.dependencies.map((dependency) => withBrand(dependency, 'ExperimentNodeId')),
    })),
    targetPhases: normalizePlanSequence(parsed.targetPhases),
    createdAt: parsed.createdAt,
  };
};

export const parseExperimentPlan = (payload: unknown): ExperimentPlan => {
  const parsed = planSchema.parse(payload);
  const tenant = makeTenantId(parsed.tenant);
  const sequence = normalizePlanSequence(parsed.sequence);
  return {
    planId: makePlanId(tenant),
    tenant,
    sequence,
    graph: parsed.graph.map((node) => ({
      nodeId: buildNodeId(tenant, node.name),
      name: node.name,
      phase: phaseSchema.parse(node.phase),
      dependencies: node.dependencies.map((dependency) => withBrand(dependency, 'ExperimentNodeId')),
      score: node.score,
      metadata: node.metadata,
    })),
    payload: {
      strategy: parsed.payload.strategy,
      horizonMinutes: parsed.payload.horizonMinutes,
      metadata: parsed.payload.metadata,
      channels: parsed.payload.channels as readonly SignalChannel[],
    },
    createdAt: parsed.createdAt,
    createdBy: makeTenantId(parsed.createdBy),
    signature: parsed.signature || makePlanSignature(sequence),
    version: withBrand(String(parsed.version), 'ExperimentPlanVersion'),
  };
};

export const parseRuntimeBundle = (payload: unknown): {
  plan: ExperimentPlan;
  context: ExperimentContext;
  intent: ExperimentIntent;
  payload: ExperimentPayload;
} => {
  const parsed = z
    .object({
      plan: z.unknown(),
      intent: z.unknown(),
      context: z.unknown(),
      payload: z.unknown(),
    })
    .parse(payload);

  return {
    plan: parseExperimentPlan(parsed.plan),
    intent: parseExperimentIntent(parsed.intent),
    context: parseExperimentContext(parsed.context),
    payload: parseExperimentPayload(parsed.payload),
  };
};

export const createIntentTemplate = (tenantId: string, phase: ExperimentPhase = 'prepare'): ExperimentIntent => {
  const tenant = makeTenantId(tenantId);
  const runId = makeRunId(tenant, `template:${phase}`) as ExperimentRunId;
  return {
    experimentId: makeExperimentId(tenant, `template:${Date.now()}`),
    runId,
    phase,
    seed: makeSeed(`template-${phase}`),
    tags: [withBrand('template', 'ExperimentTag')],
    source: `pilot-${phase}`,
    owner: `owner:${tenant}`,
    tenantId: tenant,
    createdAt: new Date().toISOString(),
  };
};

export const createContextTemplate = (tenantId: ReturnType<typeof makeTenantId>): ExperimentContext => {
  const runId = makeRunId(tenantId, 'template');
  return {
    issuer: withBrand(`issuer:${tenantId}`, 'ExperimentIssuer'),
    tenantId,
    tenantLabel: `tenant:${tenantId}`,
    namespace: `autonomy:${tenantId}`,
    activePhases: [...PHASE_SEQUENCE],
    signal: makeSignalChannel(runId),
  };
};

export const createPayloadTemplate = <T extends Record<string, unknown>>(tenantId: ReturnType<typeof makeTenantId>, metadata: T): ExperimentPayload<T> => ({
  strategy: `strategy:${tenantId}`,
  horizonMinutes: 30,
  metadata,
  channels: [`recovery:${tenantId}:control` as SignalChannel],
});

export const createPlanTemplate = (tenantId: ReturnType<typeof makeTenantId>): ExperimentPlan => ({
  planId: makePlanId(tenantId),
  tenant: tenantId,
  sequence: [...PHASE_SEQUENCE],
  graph: [],
  payload: createPayloadTemplate(tenantId, { template: true }),
  createdAt: new Date().toISOString(),
  createdBy: tenantId,
  signature: makePlanSignature(PHASE_SEQUENCE),
  version: withBrand(String(1), 'ExperimentPlanVersion'),
});
