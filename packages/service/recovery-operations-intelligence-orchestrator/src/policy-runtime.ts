import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';
import { buildBatchAssessment, buildScenarioInsights, assessSignals, type RunAssessment, type RecoveryRiskSignal } from '@domain/recovery-operations-intelligence';
import { createPolicyEngine, type PolicyEngine, type PolicyDecision as PolicyDecisionType } from '@service/recovery-operations-policy-engine';
import type { IncidentClass, RunSession, RunPlanSnapshot } from '@domain/recovery-operations-models';
import type { ReadinessSignal, ReadinessTarget, ReadinessWindow } from '@domain/recovery-readiness';
import type { RecoveryPlaybookRepository } from '@data/recovery-playbook-store';
import type { PlaybookSelectionPolicy } from '@domain/recovery-playbooks';
import { adaptPlaybooks } from '@infrastructure/recovery-operations-intelligence-adapters';
import { withBrand } from '@shared/core';

interface RuntimeDependencies {
  readonly policyRepository: Parameters<PolicyEngine['runChecks']>[0]['policyRepository'];
  readonly playbookRepository: RecoveryPlaybookRepository;
}

export interface PolicyRuntimeInput {
  readonly tenant: string;
  readonly runId: string;
  readonly signals: readonly RecoveryRiskSignal[];
  readonly plan: RunPlanSnapshot;
  readonly session: RunSession;
  readonly dependencies: RuntimeDependencies;
}

export interface PolicyRuntimeOutput {
  readonly runId: string;
  readonly tenant: string;
  readonly decision: PolicyDecisionType;
  readonly policies: readonly string[];
  readonly insights: readonly string[];
  readonly suggestedPlaybooks: readonly string[];
}

const createPolicyRuntime = (): PolicyEngine => {
  return createPolicyEngine();
};

const buildAssessmentBundle = (
  tenant: string,
  signals: readonly RecoveryRiskSignal[],
): readonly RunAssessment[] =>
  signals.map((signal, index) =>
    assessSignals(
      signal.runId,
      tenant,
      [signal.signal],
      signal.signal.severity + index,
      {
        planId: withBrand(`${tenant}-runtime`, 'RunPlanId'),
        signalBudget: {
          maxRetries: 3,
          timeoutMinutes: 20,
        },
      },
    ));

const selectPlaybookPolicy = (tenant: string, runId: string): PlaybookSelectionPolicy => ({
  maxStepsPerRun: 8,
  allowedStatuses: ['published', 'draft'],
  requiredLabels: [tenant, runId],
  forbiddenChannels: [],
});

export const runPolicyRuntime = async (input: PolicyRuntimeInput): Promise<Result<PolicyRuntimeOutput, string>> => {
  const firstSignal = input.signals[0];
  if (!firstSignal) {
    return fail('POLICY_RUNTIME_NO_SIGNAL');
  }

  const engine = createPolicyRuntime();
  const context = buildContext(input.tenant, firstSignal);
  const decision = await engine.runChecks({
    runId: input.session.runId,
    sessionId: String(input.session.id),
    tenant: input.tenant,
    program: input.plan.program,
    fingerprint: {
      tenant: withBrand(input.tenant, 'TenantId'),
      region: context.fingerprint.region,
      serviceFamily: context.fingerprint.serviceFamily,
      impactClass: context.fingerprint.impactClass,
      estimatedRecoveryMinutes: context.fingerprint.estimatedRecoveryMinutes,
    },
    readinessPlan: {
      planId: withBrand(`${context.fingerprint.tenant}-plan-${input.runId}`, 'RecoveryReadinessPlanId'),
      runId: withBrand(input.runId, 'ReadinessRunId'),
      title: `Runtime plan for ${context.fingerprint.tenant}`,
      objective: 'Policy gate execution context',
      state: 'active',
      createdAt: context.fingerprint.createdAt,
      windows: [context.readinessPlan.window],
      targets: [context.readinessPlan.target],
      signals: [context.readinessPlan.signal],
      riskBand: 'amber',
      metadata: {
        owner: 'policy-runtime-engine',
        tags: ['policy-runtime', 'orchestrator'],
        tenant: input.tenant,
      },
    },
    signals: [firstSignal.signal],
    policyRepository: input.dependencies.policyRepository,
    publisher: undefined,
  });
  if (!decision.ok) {
    return fail(decision.error);
  }

  const assessments = buildAssessmentBundle(input.tenant, input.signals);
  const cohort = input.signals.length
    ? [{
      tenant: withBrand(input.tenant, 'TenantId'),
      runId: input.signals[0]!.runId,
      count: input.signals.length,
      maxConfidence: input.signals[0]!.signal.confidence,
      distinctSources: [input.signals[0]!.source],
    }]
    : [];

  const batchAssessment = buildBatchAssessment(cohort);
  const insights = buildScenarioInsights(input.tenant, input.runId, batchAssessment.overallRisk === 'red' ? 10 : 4, input.signals);

  const adapted = await adaptPlaybooks({
    tenant: input.tenant,
    runId: input.runId,
    assessments,
    cohorts: cohort,
    policy: selectPlaybookPolicy(input.tenant, input.runId),
    repository: input.dependencies.playbookRepository,
  });

  if (!adapted.ok) {
    return fail(adapted.error);
  }

  return ok({
    runId: input.runId,
    tenant: input.tenant,
    decision: decision.value,
    policies: decision.value.outcome.findings.map((finding) => finding.ruleId),
    insights: insights.map((insight) => `${insight.path}:${insight.confidence}`),
    suggestedPlaybooks: adapted.value.selected,
  });
};

const buildContext = (tenant: string, signal: RecoveryRiskSignal) => ({
  fingerprint: {
    tenant,
    region: 'us-east-1',
    serviceFamily: 'incident-response',
    impactClass: 'application' as IncidentClass,
    estimatedRecoveryMinutes: 20,
    createdAt: new Date().toISOString(),
  },
  readinessPlan: {
    window: buildWindow(signal.window.to, 'runtime-policy'),
    target: buildTarget(tenant, signal.runId),
    signal: buildSignal(tenant, signal.runId, signal.window.to),
  },
});

const buildWindow = (endsAt: string, label: string): ReadinessWindow => {
  return {
    windowId: withBrand(`${label}-${endsAt}`, 'ReadinessWindowId'),
    label,
    fromUtc: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    toUtc: endsAt,
    timezone: 'UTC',
  };
};

const buildTarget = (tenant: string, runId: string): ReadinessTarget => {
  return {
    id: withBrand(`${tenant}-target-${runId}`, 'RecoveryTargetId'),
    name: `${tenant}-runtime-target`,
    ownerTeam: `${tenant}-ops`,
    region: 'us-east-1',
    criticality: 'high',
    owners: ['sre', 'automations'],
  };
};

const buildSignal = (tenant: string, runId: string, capturedAt: string): ReadinessSignal => {
  return {
    signalId: withBrand(`${tenant}-signal-${runId}`, 'ReadinessSignalId'),
    runId: withBrand(runId, 'ReadinessRunId'),
    targetId: withBrand(`${tenant}-target-${runId}`, 'RecoveryTargetId'),
    source: 'telemetry',
    name: 'policy-runtime-signal',
    severity: 'medium',
    capturedAt,
    details: {
      tenant,
      source: 'runtime-orchestrator',
      type: 'policy-runtime',
    },
  };
};
