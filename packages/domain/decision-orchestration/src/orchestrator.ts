import { toRiskBucket, parseDecisionIntent, type DecisionOutcome, type DecisionIntent, type TInputTemplate } from './models';
import { buildExecutionGraph } from './graph';
import { executeDecision } from './executor';
import { ok, fail, type Result } from '@shared/result';
import { classify, createProfile } from '@domain/risk';
import type { PolicyRepository } from '@data/decision-catalog';
import { summarizeActors, createPlan, type SelectionPolicy } from './selection';
import { defaultPolicyCandidateFactory, loadPolicyCandidates } from './selection-factory';

export interface OrchestratorDeps {
  repository: PolicyRepository;
  clock: { now: () => string };
}

export interface OrchestratorOverrides {
  candidates?: {
    byPolicy: (intent: DecisionIntent) => SelectionPolicy;
    candidates: typeof defaultPolicyCandidateFactory;
  };
}

export async function runDecision<TOutput>(
  raw: unknown,
  deps: OrchestratorDeps,
  overrides?: OrchestratorOverrides,
): Promise<Result<DecisionOutcome<TOutput>, string>> {
  const parsed = parseDecisionIntent(raw);
  if (!parsed.ok) return fail(parsed.error);

  const intent = parsed.value;
  const template = await deps.repository.getPolicy(intent.policyId);
  if (!template) return fail(`Policy missing: ${intent.policyId}`);

  const profile = createProfile({
    eventType: 'decision.intake',
    amount: 0,
    tenantId: intent.tenantId,
    userId: intent.subjectId,
  });

  const riskScore = classify(profile);
  const risk = toRiskBucket({ ...profile, score: riskScore === 'high' ? 30 : profile.score });

  const candidateFactory = overrides?.candidates?.candidates ?? defaultPolicyCandidateFactory;
  const policy = overrides?.candidates?.byPolicy ? overrides.candidates.byPolicy(intent) : { minScore: 10, maxKeep: 16 };
  const candidateRecords = candidateFactory(template, intent);

  const input: TInputTemplate = {
    tenantId: intent.tenantId,
    subjectId: intent.subjectId,
    context: { ...intent.context, requestedAt: intent.requestedAt, resolvedAt: deps.clock.now() },
    priority: intent.priority,
  };

  const plan = createPlan(template, input, loadPolicyCandidates(candidateRecords), policy);
  executeDecision(template, plan);
  buildExecutionGraph(template);

  return ok({
    plan,
    riskBucket: risk,
    selectedActors: summarizeActors(
      plan.candidates.map((candidate, index) => ({
        id: `${intent.decisionId}:${index}`,
        type: (candidate.output as { actionType?: string })?.actionType ?? 'allow',
        actor: template.nodes[index % template.nodes.length]?.actor ?? 'system',
        context: candidate.output as TOutput,
        weight: candidate.score,
      })),
    ),
    policy: template,
  });
}
