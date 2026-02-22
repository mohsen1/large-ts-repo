import { withBrand } from '@shared/core';
import type {
  PolicyExecutionContext,
  PolicySimulationInput,
  PolicySimulationResult,
  PolicyResultEnvelope,
  PolicyTimeline,
} from './policy-types';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { computePolicyScoreCard } from './policy-scorecard';
import { buildDecisionCatalog, decisionCatalogFromContext } from './policy-catalog';
import { validatePolicyContext } from './policy-validation';
import { buildTimeline } from './policy-adapters';

export const simulatePolicyDecision = (
  input: PolicySimulationInput,
): PolicySimulationResult => {
  const fakeReadinessPlan: RecoveryReadinessPlan = {
    planId: withBrand(`${input.runId}-plan`, 'RecoveryReadinessPlanId'),
    runId: withBrand(`${input.runId}-ready`, 'ReadinessRunId'),
    title: 'simulated-readiness',
    objective: 'simulation',
    state: 'active',
    createdAt: input.nowIso,
    targets: [],
    windows: [],
    signals: [],
    riskBand: 'amber' as const,
    metadata: {
      owner: 'simulator',
      tags: ['simulation'],
    },
  };

  const fakeSession = {
    id: withBrand(`${input.runId}-session`, 'RunSessionId'),
    runId: input.runId,
    ticketId: withBrand(`${input.runId}-ticket`, 'RunTicketId'),
    planId: withBrand(`${input.runId}-planid`, 'RunPlanId'),
    status: 'queued' as const,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
    constraints: {
      maxParallelism: 2,
      maxRetries: 2,
      timeoutMinutes: 30,
      operatorApprovalRequired: false,
    },
    signals: input.signals,
  };

  const context: PolicyExecutionContext = {
    tenant: input.tenant,
    runId: String(input.runId),
    sessionId: `${input.runId}:session`,
    session: fakeSession,
    program: input.program,
    readinessPlan: fakeSession ? fakeReadinessPlan : fakeReadinessPlan,
    signals: input.signals,
    readinessSignals: [],
    startedAt: input.nowIso,
    triggeredBy: 'simulation',
  };

  const validation = validatePolicyContext(context);
  if (!validation.isValid) {
    return {
      score: 10,
      expectedOutcome: 'block',
      riskProjection: {
        immediate: 0.98,
        projected15m: 0.96,
        projected1h: 0.94,
      },
      policyDelta: {
        passed: 0,
        blocked: 1,
        confidence: 0.2,
      },
    };
  }

  const scoreCard = computePolicyScoreCard(context);
  const decision = scoreCard.compositeScore >= 62 ? 'allow' : 'block';
  const catalog = decisionCatalogFromContext(context, scoreCard);
  const _detail = buildDecisionCatalog(decision, scoreCard);

  return {
    score: scoreCard.compositeScore,
    expectedOutcome: decision,
    riskProjection: {
      immediate: decision === 'allow' ? 0.22 : 0.76,
      projected15m: decision === 'allow' ? 0.18 : 0.72,
      projected1h: decision === 'allow' ? 0.14 : 0.66,
    },
    policyDelta: {
      passed: decision === 'allow' ? 1 : 0,
      blocked: decision === 'allow' ? 0 : 1,
      confidence: catalog.confidence,
    },
  };
};

export const buildMockEnvelope = (
  runId: string,
  tenant: string,
  score: number,
  decision: 'allow' | 'block',
): PolicyResultEnvelope => {
  const scoreCard = {
    signalScore: score,
    policyScore: score,
    densityScore: score,
    riskScore: score,
    readinessScore: score,
    compositeScore: score,
  };

  return {
    tenant,
    runId,
    state: decision === 'allow' ? 'allowed' : 'blocked',
    steps: ['prepare', 'evaluate', 'score', 'publish'],
    outcome: {
      decision,
      reason: `simulated-${decision}`,
      confidence: Number((score / 100).toFixed(4)),
    },
    summary: {
      decision,
      decisionReason: `score=${score}`,
      confidence: Number((score / 100).toFixed(4)),
      criticality: score > 60 ? 'low' : score > 40 ? 'medium' : 'high',
      findings: ['policy-simulator', `decision=${decision}`],
    },
    scoreCard,
    complianceTags: ['sim', 'policy'],
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
};

export const buildSimulationTimeline = (runId: string, tenant: string, outcome: { state: PolicyResultEnvelope['state']; summary: PolicyResultEnvelope['summary'] }): PolicyTimeline => {
  const sourceContext: PolicyExecutionContext = {
    tenant: withBrand(tenant, 'TenantId'),
    runId,
    sessionId: `${runId}:session`,
    session: {
      id: withBrand(runId, 'RunSessionId'),
      runId: withBrand(runId, 'RecoveryRunId'),
      ticketId: withBrand(`${runId}-ticket`, 'RunTicketId'),
      planId: withBrand(`${runId}-plan`, 'RunPlanId'),
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      constraints: {
        maxParallelism: 2,
        maxRetries: 2,
        timeoutMinutes: 30,
        operatorApprovalRequired: false,
      },
      signals: [],
    },
    program: {
      id: withBrand(`${runId}-program`, 'RecoveryProgramId'),
      tenant: withBrand(tenant, 'TenantId'),
      service: withBrand('policy', 'ServiceId'),
      name: 'Sim plan',
      description: 'simulated',
      priority: 'silver',
      mode: 'defensive',
      window: {
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        timezone: 'UTC',
      },
      topology: {
        rootServices: ['api'],
        fallbackServices: [],
        immutableDependencies: [['api', 'db']],
      },
      constraints: [],
      steps: [],
      owner: 'sim',
      tags: ['sim'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    readinessPlan: {
      planId: withBrand(`${runId}-ready`, 'RecoveryReadinessPlanId'),
      runId: withBrand(`${runId}-ready-run`, 'ReadinessRunId'),
      title: 'ready',
      objective: 'sim',
      state: 'active',
      createdAt: new Date().toISOString(),
      targets: [],
      windows: [],
      signals: [],
      riskBand: 'green',
      metadata: { owner: 'sim', tags: ['sim'] },
    },
    readinessSignals: [],
    startedAt: new Date().toISOString(),
    triggeredBy: 'simulation',
    signals: [],
  };

  const score = computePolicyScoreCard(sourceContext);
  const catalog = buildDecisionCatalog(outcome.summary.decision, score);
  const line = `${catalog.policySignals.join('|')}`;
  return buildTimeline(runId, tenant, {
    ...outcome,
    summary: {
      ...outcome.summary,
      decisionReason: `${outcome.summary.decisionReason} ${line}`,
    },
  } as { state: PolicyResultEnvelope['state']; summary: PolicyResultEnvelope['summary'] });
};
