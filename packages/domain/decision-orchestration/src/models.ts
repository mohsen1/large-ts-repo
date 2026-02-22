import { z } from 'zod';
import { Brand } from '@shared/core';
import type { RiskProfile } from '@domain/risk';
import { ok, fail, type Result } from '@shared/result';
import { DecisionPolicyTemplate } from '@data/decision-catalog';

export type DecisionId = Brand<string, 'DecisionId'>;
export type RunId = Brand<string, 'RunId'>;

export const DecisionIntentSchema = z.object({
  decisionId: z.string().min(1),
  tenantId: z.string().min(1),
  policyId: z.string().min(1),
  subjectId: z.string().min(1),
  requestedAt: z.iso.datetime(),
  context: z.record(z.unknown()).default({}),
  priority: z.number().int().min(0).max(10).default(5),
});

export type DecisionIntent = z.infer<typeof DecisionIntentSchema>;

export type TInputTemplate = {
  tenantId: string;
  subjectId: string;
  context: Record<string, unknown>;
  priority: number;
};

export interface DecisionAction<TContext = unknown> {
  id: string;
  type: string;
  actor: string;
  context: TContext;
  weight: number;
}

export interface CandidateDecision<TOutput = unknown> {
  id: DecisionId;
  score: number;
  output: TOutput;
}

export interface DecisionTraceStep {
  nodeId: string;
  actor: string;
  score: number;
}

export interface DecisionPlan<TInput extends TInputTemplate, TOutput> {
  runId: RunId;
  policyId: string;
  template: DecisionPolicyTemplate;
  input: TInput;
  candidates: ReadonlyArray<CandidateDecision<TOutput>>;
  trace: ReadonlyArray<DecisionTraceStep>;
}

export interface DecisionOutcome<TOutput> {
  plan: DecisionPlan<TInputTemplate, TOutput>;
  riskBucket: 'low' | 'medium' | 'high';
  selectedActors: string;
  policy: DecisionPolicyTemplate;
}

export function parseDecisionIntent(raw: unknown): Result<DecisionIntent, string> {
  const parsed = DecisionIntentSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join(';'));
  }
  return ok(parsed.data);
}

export function toRiskBucket(profile: RiskProfile): 'low' | 'medium' | 'high' {
  if (profile.score >= 70) return 'low';
  if (profile.score >= 40) return 'medium';
  return 'high';
}
