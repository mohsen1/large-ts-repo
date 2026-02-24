import {
  buildConstraintEnvelope,
  evaluateGovernance,
  createGovernanceRunId,
  createGovernanceTenantId,
  clampPolicyRatio,
  type GovernanceContext,
  type PolicyProfile,
  type GovernanceSignal,
  type PolicyEnvelope,
  type GovernanceEvaluation,
  type PolicyWindow,
  type ReadinessSnapshot,
  type GovernanceTenantId,
  type GovernanceRunId,
} from '@domain/recovery-lab-governance';
import type { IncidentLabSignal, IncidentLabScenario, IncidentLabPlan } from './types';
import {
  buildControlEventName,
  type ControlEventName,
  type ControlPolicyInput,
  type ControlPolicyOutput,
} from './control-orchestration-types';

export type ScenarioPolicyProfile<TSignals extends readonly IncidentLabSignal['kind'][]> = {
  readonly context: GovernanceContext;
  readonly profile: PolicyProfile;
  readonly windows: readonly PolicyWindow[];
  readonly signals: TSignals;
};

export interface PolicyBridgeEnvelope<TSignals extends readonly IncidentLabSignal['kind'][]> {
  readonly scenarioId: IncidentLabScenario['id'];
  readonly tenant: GovernanceTenantId;
  readonly runId: GovernanceRunId;
  readonly policy: ScenarioPolicyProfile<TSignals>;
  readonly profileEnvelope: PolicyEnvelope;
  readonly evaluation: GovernanceEvaluation;
  readonly readiness: ReadinessSnapshot;
  readonly diagnostics: readonly {
    readonly event: ControlEventName<'policy', 'report', number>;
    readonly issue: string;
  }[];
}

const toPolicySignals = (signals: readonly IncidentLabSignal['kind'][]): readonly GovernanceSignal[] =>
  signals.map((signal, index) => ({
    id: `${signal}:${index}` as GovernanceSignal['id'],
    tenantId: createGovernanceTenantId(signal),
    metric: `signal:${signal}`,
    severity: index > 1 ? (index > 3 ? 'critical' : 'medium') : 'low',
    value: index + 1,
    tags: [signal, `signal:${signal}`],
    observedAt: new Date(Date.now() + index * 123).toISOString(),
  }));

const createWindow = (index: number, plan: IncidentLabPlan): PolicyWindow => ({
  id: `${plan.id}:window-${index}` as PolicyWindow['id'],
  tenantId: createGovernanceTenantId(String(plan.id)),
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 15_000).toISOString(),
  openForAllBands: true,
  allowedBands: ['low', 'medium', 'critical', 'critical'],
});

const createProfile = <TSignals extends readonly IncidentLabSignal['kind'][]>(
  scenario: IncidentLabScenario,
  signals: TSignals,
): ScenarioPolicyProfile<TSignals> => {
  const context: GovernanceContext = {
    tenantId: createGovernanceTenantId(String(scenario.id)),
    timestamp: new Date().toISOString(),
    domain: 'incident-lab',
    region: 'global',
    state: 'active',
  };
  const profile: PolicyProfile = {
    policyId: `${String(scenario.id)}:policy` as PolicyProfile['policyId'],
    tenantId: context.tenantId,
    name: `${String(scenario.id)} policy`,
    domain: 'recovery-incident-lab',
    state: 'active',
    maxConcurrent: Math.max(1, Math.ceil(signals.length / 2)),
    maxCriticality: signals.length > 3 ? 5 : 3,
    windowsByBand: {
      low: [],
      medium: [],
      high: [],
      critical: [],
    },
    rules: [],
  };
  const windows = signals.map((_, index) =>
    createWindow(
      index,
      {
        id: `${scenario.id}:plan` as IncidentLabPlan['id'],
        scenarioId: scenario.id,
        labId: scenario.labId,
        selected: [],
        queue: [],
        state: 'draft',
        orderedAt: new Date().toISOString(),
        scheduledBy: 'policy-bridge',
      },
    ),
  );
  return { context, profile, windows, signals };
};

export const evaluateLabPolicy = <TSignals extends readonly IncidentLabSignal['kind'][]>(
  input: ControlPolicyInput<TSignals>,
): ControlPolicyOutput<TSignals> => {
  const policy = createProfile(input.scenario, input.signals);
  const governanceSignals = [...input.governanceSignals, ...toPolicySignals(input.signals)];
  const evaluation = evaluateGovernance({
    context: policy.context,
    profile: policy.profile,
    signals: governanceSignals,
    profileList: [policy.profile],
    windows: policy.windows,
    rules: policy.profile.rules,
  });
  const warnings = [
    ...evaluation.warning,
    buildControlEventName('policy', 'recommend', input.signals.length),
  ];
  return {
    signals: input.signals,
    readinessScore: clampPolicyRatio(evaluation.readiness),
    warnings: warnings.toSorted(),
    policy: policy.profile,
  };
};

const toGovernanceEvaluation = (readiness: ReadinessSnapshot, policy: PolicyProfile): GovernanceEvaluation => ({
  tenantId: readiness.tenantId,
  runId: createGovernanceRunId(`${String(readiness.tenantId)}:control:${Date.now()}`),
  policyCoverage: readiness.policyCoverage,
  warningCount: readiness.warning.length,
  criticalCount: readiness.warning.filter((entry) => entry.includes('critical')).length,
  readinessScore: clampPolicyRatio(readiness.readiness),
  policySignals: [],
  windowCompliance: true,
});

export const buildPolicyBridgeEnvelope = <TSignals extends readonly IncidentLabSignal['kind'][]>(
  input: ControlPolicyInput<TSignals>,
): Promise<PolicyBridgeEnvelope<TSignals>> => {
  const policy = createProfile(input.scenario, input.signals);
  const signalNames = input.signals.toSorted();
  const policySignals = toPolicySignals(input.signals).toSorted((left, right) => left.metric.localeCompare(right.metric));
  const readiness = evaluateGovernance({
    context: policy.context,
    profile: policy.profile,
    signals: policySignals,
    profileList: [policy.profile],
    windows: policy.windows,
    rules: policy.profile.rules,
  });
  const profileEnvelope: PolicyEnvelope = {
    id: `${String(policy.context.tenantId)}:envelope:${input.scenario.id}` as PolicyEnvelope['id'],
    tenantId: policy.context.tenantId,
    title: `Envelope ${String(input.scenario.id)}`,
    policies: [policy.profile],
    windows: policy.windows,
    rules: policy.profile.rules,
    constraints: signalNames.map((signalName, index) => buildConstraintEnvelope(policy.context, policy.profile, index)),
    complianceClauses: [],
    createdAt: new Date().toISOString(),
  };
  const diagnostics = [
    {
      event: buildControlEventName('policy', 'report', signalNames.length),
      issue: `readiness:${readiness.readiness}`,
    },
  ];
  const snapshot: ReadinessSnapshot = {
    tenantId: policy.context.tenantId,
    readiness: clampPolicyRatio(readiness.readiness),
    policyCoverage: readiness.policyCoverage,
    warning: diagnostics.map((entry) => entry.issue),
  };
  return Promise.resolve({
    scenarioId: input.scenario.id,
    tenant: policy.context.tenantId,
    runId: `${String(policy.context.tenantId)}:${Date.now()}` as GovernanceRunId,
    policy,
    profileEnvelope,
    evaluation: toGovernanceEvaluation(snapshot, policy.profile),
    readiness: snapshot,
    diagnostics,
  });
};
