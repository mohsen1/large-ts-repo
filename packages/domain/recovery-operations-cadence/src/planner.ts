import { z } from 'zod';
import { withBrand } from '@shared/core';
import {
  type CadenceProfile,
  type CadencePlanCandidate,
  type CadenceRunPlan,
  type CadenceEvaluation,
  type CadenceEnvelope,
  type CadenceEnvelopeSource,
} from './types';
import { DefaultCadencePolicyEngine } from './policy';
import { buildTopology, splitByExecutionWindow } from './topology';
import { calculateCoverage, estimateAverageDuration, toPartition } from './utility';
import { type RecoveryRunState } from '@domain/recovery-orchestration';
import { type RunSession, type RunPlanId } from '@domain/recovery-operations-models';

const zoneSchema = z
  .string()
  .min(1)
  .refine((value) => value.includes('/'), { message: 'window timezone must be qualified' });

const windowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: zoneSchema,
  maxParallelism: z.number().int().min(1).max(100),
  maxRetries: z.number().int().min(0).max(20),
  requiredApprovals: z.number().int().min(0).max(10),
});

const slotSchema = z.object({
  id: z.string().min(1),
  windowId: z.string().min(1),
  stepId: z.string().min(1),
  plannedFor: z.string().datetime(),
  planId: z.string().min(1),
  command: z.string().min(1),
  weight: z.number().min(0).max(1),
  tags: z.array(z.string()),
  requires: z.array(z.string()),
  estimatedMinutes: z.number().min(1).max(10_000),
});

const profileSchema = z.object({
  tenant: z.string().min(1),
  programRun: z.string().min(1),
  windows: z.array(windowSchema),
  slots: z.array(slotSchema),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  source: z.enum(['planner', 'operator', 'automation', 'policy']),
});

const candidateSchema = z.object({
  profile: profileSchema,
  constraints: z.array(
    z.object({
      id: z.string().min(1),
      key: z.string().min(1),
      expression: z.string().min(1),
      enabled: z.boolean(),
      weight: z.number().min(0).max(1),
    }),
  ),
  notes: z.array(z.string()),
  revision: z.number().int().min(0),
});

export type ParsedCadenceCandidate = z.infer<typeof candidateSchema>;

export const parseCadenceCandidate = (input: unknown): CadencePlanCandidate => {
  const parsed = candidateSchema.parse(input) as ParsedCadenceCandidate;

  return {
    ...parsed,
    profile: {
      ...parsed.profile,
      tenant: withBrand(parsed.profile.tenant, 'TenantId'),
      programRun: withBrand(parsed.profile.programRun, 'RecoveryRunId'),
      windows: parsed.profile.windows.map((window) => ({
        ...window,
        id: withBrand(window.id, 'CadenceWindowId'),
      })),
      slots: parsed.profile.slots.map((slot) => ({
        ...slot,
        id: withBrand(slot.id, 'CadenceSlotId'),
        stepId: slot.stepId,
        windowId: withBrand(slot.windowId, 'CadenceWindowId'),
        planId: withBrand(slot.planId, 'RunPlanId'),
        requires: slot.requires.map((dependency) => withBrand(dependency, 'CadenceSlotId')),
      })),
      source: parsed.profile.source,
    },
    constraints: parsed.constraints.map((constraint) => ({
      ...constraint,
      id: withBrand(constraint.id, 'CadencePolicyConstraintId'),
    })),
  };
};

const mapRunState = (run: RecoveryRunState): string =>
  `run-${run.runId}-${run.programId}-${run.status ?? 'queued'}`;

const mapSession = (session: RunSession): string => `${session.id}-${session.runId}-${session.ticketId}`;

export const buildCandidateFromRun = (
  run: RecoveryRunState,
  session: RunSession,
  windows: CadenceProfile['windows'],
  slots: CadenceProfile['slots'],
  source: CadenceEnvelopeSource,
): CadencePlanCandidate => {
  return {
    profile: {
      tenant: withBrand(run.runId, 'TenantId'),
      programRun: run.runId,
      windows,
      slots,
      priority: session.constraints.operatorApprovalRequired ? 'high' : 'normal',
      source,
    },
    constraints: [
      {
        id: withBrand(`${mapRunState(run)}-${mapSession(session)}`, 'CadencePolicyConstraintId'),
        key: 'window_alignment',
        expression: 'windowCoverage >= 0.75',
        enabled: true,
        weight: 0.75,
      },
      {
        id: withBrand(`${run.runId}-constraints`, 'CadencePolicyConstraintId'),
        key: 'retry_cap',
        expression: 'maxRetries <= 8',
        enabled: session.constraints.maxRetries < 8,
        weight: 0.25,
      },
    ],
    notes: [
      `run=${run.runId}`,
      `session=${session.runId}`,
      `windowCount=${windows.length}`,
    ],
    revision: Number(`${Date.now()}`.slice(-6)),
  };
};

export const planCandidate = (
  candidate: CadencePlanCandidate,
  now: string = new Date().toISOString(),
): CadenceRunPlan => {
  const policy = new DefaultCadencePolicyEngine();
  const evaluation: CadenceEvaluation = policy.evaluate(candidate);
  const topology = buildTopology(candidate);
  const partition = toPartition(candidate);
  const windowCoverage = calculateCoverage(partition.windows, partition.slots);
  const averageDuration = estimateAverageDuration(partition.slots);

  const [windowA, ...remainingWindows] = splitByExecutionWindow({
    id: withBrand(`candidate-${candidate.revision}`, 'RecoveryCadenceId'),
    runId: withBrand(`run-${now}`, 'CadenceRunId'),
    profile: candidate.profile,
    candidateHash: withBrand(`${candidate.revision}-${candidate.profile.slots.length}`, 'CadenceCandidateHash'),
    constraintFingerprint: withBrand(`${candidate.constraints.length}-${candidate.notes.length}`, 'CadenceConstraintFingerprint'),
    createdAt: now,
    outcome: evaluation.ok ? 'ready' : 'deferred',
    slots: partition.slots,
    windows: partition.windows,
    readinessScore: evaluation.score,
    policySummary: {
      enabledConstraints: candidate.constraints.filter((constraint) => constraint.enabled).length,
      blockedByRules: evaluation.reasons,
      warnings: evaluation.warnings,
    },
    audit: {
      createdBy: candidate.profile.source,
      reviewedBy: [withBrand('planner', 'UserId')],
      approved: evaluation.ok,
      approvedAt: evaluation.ok ? now : undefined,
      reasonTrail: [...evaluation.reasons, ...topology.edges.map((edge) => `${String(edge.from)}->${String(edge.to)}`)],
    },
  });

  void remainingWindows;

  return {
    id: withBrand(`cadence-${candidate.revision}`, 'RecoveryCadenceId'),
    runId: windowA?.runId ?? withBrand(`run-${candidate.revision}`, 'CadenceRunId'),
    profile: candidate.profile,
    candidateHash: withBrand(
      `${candidate.revision}-${candidate.profile.slots.length}-${windowCoverage}`,
      'CadenceCandidateHash',
    ),
    constraintFingerprint: withBrand(
      `${candidate.constraints.length}-${candidate.notes.length}-${averageDuration}`,
      'CadenceConstraintFingerprint',
    ),
    createdAt: now,
    outcome: evaluation.ok ? 'ready' : 'deferred',
    slots: partition.slots,
    windows: partition.windows,
    readinessScore: Number((evaluation.score - topology.edges.length * 0.25).toFixed(3)),
    policySummary: {
      enabledConstraints: candidate.constraints.filter((constraint) => constraint.enabled).length,
      blockedByRules: evaluation.reasons,
      warnings: evaluation.warnings,
    },
    audit: {
      createdBy: candidate.profile.source,
      reviewedBy: [withBrand('planner', 'UserId')],
      approved: evaluation.ok,
      approvedAt: evaluation.ok ? now : undefined,
      reasonTrail: [...evaluation.reasons, ...topology.edges.map((edge) => `${String(edge.from)}->${String(edge.to)}`)],
    },
  };
};

export const validateCadenceRunPlan = (plan: CadenceRunPlan): CadenceEvaluation => {
  const profileCandidate: CadencePlanCandidate = {
    profile: plan.profile,
    constraints: [
      {
        id: withBrand(`constraint-${plan.id}`, 'CadencePolicyConstraintId'),
        key: 'readonly',
        expression: 'result',
        enabled: true,
        weight: 1,
      },
    ],
    notes: ['runtime-validation', 'generated'],
    revision: Number(plan.runId.replace(/[^0-9]/g, '').slice(0, 6) || '1'),
  };

  if (plan.slots.length === 0) {
    return {
      ok: false,
      reasons: ['Cadence plan contains no slots'],
      score: 0,
      warnings: ['No execution slots were generated'],
    };
  }

  const ready = new DefaultCadencePolicyEngine().evaluate(profileCandidate);
  return ready;
};

export const envelopeForCadencePlan = (plan: CadenceRunPlan): CadenceEnvelope<CadenceRunPlan> => ({
  id: withBrand(`env-${plan.id}`, 'CadenceEnvelopeId'),
  version: 1,
  profile: plan.profile,
  payload: plan,
});

export const createRunId = (): CadenceEnvelope<CadenceRunPlan>['id'] => {
  return withBrand(`${Date.now()}-${globalThis.crypto.randomUUID()}`, 'CadenceEnvelopeId');
};

export const normalizePlanId = (raw: string): RunPlanId => {
  return withBrand(raw, 'RunPlanId');
};
