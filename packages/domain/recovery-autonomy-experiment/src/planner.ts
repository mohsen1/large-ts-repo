import { z } from 'zod';
import { withBrand } from '@shared/core';
import {
  PHASE_SEQUENCE,
  makePlanId,
  makePlanSignature,
  makeTenantId,
  makeRunId,
  makePhaseEnvelope,
  buildNodeId,
  makeSignalChannel,
  normalizeNodeScore,
  normalizePlanSequence,
  toPhaseArray,
  type ExperimentPayload,
  type ExperimentContext,
  type ExperimentPlan,
  type PlanBuildBundle,
  type PlanBuildOptions,
  type PlanDraft,
  type PlanInput,
  type ExperimentPhase,
  type ExperimentNode,
  type SignalChannel,
  type ExperimentPlanVersion,
} from './types';
import { parsePlanDraft } from './schema';

const candidateSchema = z.object({
  tenant: z.string(),
  namespace: z.string(),
  candidateNodes: z
    .array(
      z.object({
        nodeId: z.string().default('node'),
        name: z.string().min(2),
        phase: z.enum(PHASE_SEQUENCE),
        dependencies: z.array(z.string()).default([]),
        score: z.number().min(0).max(1),
        metadata: z.record(z.unknown()).default({}),
      }),
    )
    .default([]),
  targetPhases: z.array(z.enum(PHASE_SEQUENCE)).default([...PHASE_SEQUENCE]),
  createdAt: z.string().optional(),
});

const payloadSchema = z.object({
  strategy: z.string().min(3),
  horizonMinutes: z.number().int().min(1),
  metadata: z.record(z.unknown()).default({}),
});

export const normalizeDraft = (input: PlanInput['draft']): PlanDraft => ({
  ...input,
  targetPhases: normalizePlanSequence(input.targetPhases),
  candidateNodes: input.candidateNodes,
});

export const buildPlan = async <TMetadata extends Record<string, unknown>>(
  input: PlanInput<TMetadata>,
  options: PlanBuildOptions,
): Promise<PlanBuildBundle<TMetadata>> => {
  const parsed = payloadSchema.parse({
    strategy: input.draft.candidateNodes.length ? `generated-${input.context.tenantId}` : 'generated',
    horizonMinutes: 30,
    metadata: input.draft.tenant,
  });

  const sequence = normalizePlanSequence(input.draft.targetPhases);
  const envelope = makePhaseEnvelope(sequence);

  const nodes = input.draft.candidateNodes
    .toSorted((left, right) => right.score - left.score)
    .slice(0, Math.max(1, options.maxDepth))
    .map((candidate) => {
      const node: ExperimentNode<TMetadata> = {
        nodeId: buildNodeId(input.draft.tenant, candidate.name),
        name: candidate.name,
        phase: candidate.phase,
        dependencies: candidate.dependencies as never,
        score: normalizeNodeScore(candidate.score),
        metadata: candidate.metadata as TMetadata,
      };
      return node;
    });

  const payload: ExperimentPayload<TMetadata> = {
    strategy: parsed.strategy,
    horizonMinutes: 30,
    metadata: { ...(parsed.metadata as TMetadata), createdBy: options.tenantAlias },
    channels: [
      makeSignalChannel(makeRunId(input.draft.tenant, 'planner:plan')),
      makeSignalChannel(makeRunId(input.draft.tenant, `tenant:${input.context.tenantLabel}`)),
    ] as readonly SignalChannel[],
  };

    const rawPlan = {
      planId: makePlanId(input.draft.tenant),
      tenant: input.draft.tenant,
      sequence: toPhaseArray(sequence),
      graph: nodes,
      payload,
      createdAt: new Date().toISOString(),
      createdBy: input.draft.tenant,
      signature: makePlanSignature(sequence),
      version: withBrand('1', 'ExperimentPlanVersion'),
    } satisfies Omit<ExperimentPlan<TMetadata>, 'createdBy'> & {
      readonly createdBy: string;
    };

  const plan: ExperimentPlan<TMetadata> = {
    ...rawPlan,
    createdBy: input.draft.tenant,
    signature: `${Object.keys(envelope).length}:${makePlanSignature(sequence)}`,
    version: (rawPlan.version as ExperimentPlanVersion),
  };

  const diagnostics = [
    `phases:${sequence.length}`,
    `nodes:${nodes.length}`,
    `signature:${plan.signature}`,
    `tenant:${input.draft.tenant}`,
    `alias:${options.tenantAlias}`,
  ];

  return {
    plan,
    diagnostics,
    draftSignature: `${input.draft.draftId}:${plan.signature}`,
    manifest: {
      nodes: nodes.length,
      phases: sequence.length,
      signature: plan.signature,
    },
  };
};

export const buildPlanFromDraft = async <TMetadata extends Record<string, unknown>>(
  draft: {
    tenant: string;
    namespace: string;
    candidateNodes: readonly any[];
    targetPhases?: readonly string[];
  },
  payload: { strategy: string; horizonMinutes: number },
  options: PlanBuildOptions,
): Promise<PlanBuildBundle<TMetadata>> => {
  const parsed = candidateSchema.parse(draft);
  const context: ExperimentContext = {
    issuer: withBrand(options.tenantAlias, 'ExperimentIssuer'),
    tenantId: makeTenantId(parsed.tenant),
    tenantLabel: `tenant:${parsed.tenant}`,
    namespace: `autonomy:${parsed.tenant}` as const,
    activePhases: [...PHASE_SEQUENCE],
    signal: `${parsed.tenant}:signal` as SignalChannel,
  };

  const draftPayload: PlanDraft<TMetadata> = {
    draftId: `draft:${parsed.tenant}:${Date.now()}` as any,
    tenant: makeTenantId(parsed.tenant),
    namespace: parsed.namespace as never,
    candidateNodes: parsed.candidateNodes as never,
    targetPhases: normalizePlanSequence(parsed.targetPhases),
    createdAt: parsed.createdAt ?? new Date().toISOString(),
  };

  const normalizedInput: PlanInput<TMetadata> = {
    context,
    draft: parsePlanDraft(draftPayload as never) as PlanDraft<TMetadata>,
  };

  const built = await buildPlan(normalizedInput, options);
  return {
    ...built,
    manifest: {
      ...built.manifest,
      signature: `${built.draftSignature}:${payload.strategy}`,
    },
  };
};

export const parsePhaseMap = <T extends readonly ExperimentPhase[]>(phases: T): Record<`step:${ExperimentPhase}`, number> => {
  const normalized = normalizePlanSequence(phases);
  return Object.fromEntries(normalized.map((phase, index) => [`step:${phase}`, index] as const)) as Record<
    `step:${ExperimentPhase}`,
    number
  >;
};

export const toNodeIds = (tenant: string, phases: readonly ExperimentPhase[]): readonly string[] =>
  phases.map((phase, index) => `${tenant}:${phase}:${index}`);

export const withPlanTemplate = (): { readonly tenant: string } => ({ tenant: 'template' as const });

export const hasCandidateForPhase = (draft: PlanDraft, phase: ExperimentPhase): boolean =>
  draft.candidateNodes.some((node) => node.phase === phase);
