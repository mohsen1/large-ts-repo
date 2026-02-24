import {
  createGovernanceTenantId,
  GovernanceContext,
  GovernanceSignal,
  PolicyProfile,
  PolicyRule,
  PolicyWindow,
  SeverityBand,
} from '@domain/recovery-lab-governance';
import { buildReadinessEnvelope, buildEnvelope as buildGovernanceEnvelope, evaluateGovernance, evaluateGovernanceMatrix, topRankedPolicies } from '@domain/recovery-lab-governance';
import { CommandRunbook, OrchestrationPlan, RecoverySignal, WorkloadTopology, TenantId } from './models';

export interface StressLabGovernanceContext {
  readonly tenantId: TenantId;
  readonly domain: string;
  readonly region: string;
  readonly state: 'ready' | 'running' | 'stopped';
  readonly profileMode: 'readiness' | 'recovery' | 'simulation';
  readonly severityBand: SeverityBand;
}

export interface GovernanceDraft {
  readonly tenantId: TenantId;
  readonly profile: PolicyProfile;
  readonly windows: readonly PolicyWindow[];
  readonly rules: readonly PolicyRule[];
  readonly topology: WorkloadTopology;
  readonly signalDigest: ReturnType<typeof summarizeGovernanceSignals>;
  readonly generatedAt: string;
}

export interface GovernanceDecision {
  readonly tenantId: TenantId;
  readonly matrix: ReturnType<typeof evaluateGovernanceMatrix>;
  readonly rankings: ReturnType<typeof topRankedPolicies>;
  readonly signals: ReadonlyArray<GovernanceSignal>;
  readonly complianceReady: boolean;
}

export interface StabilityEnvelope {
  readonly tenantId: TenantId;
  readonly profile: ReturnType<typeof buildReadinessEnvelope>;
  readonly runbooks: readonly CommandRunbook[];
  readonly activePlanWindows: number;
}

const signalSeverity = (band: SeverityBand): number => {
  if (band === 'critical') return 100;
  if (band === 'high') return 75;
  if (band === 'medium') return 50;
  return 25;
};

export const summarizeGovernanceSignals = (tenantId: TenantId, signals: readonly RecoverySignal[]) => {
  let weighted = 0;
  const unique = new Set<string>();
  for (const signal of signals) {
    weighted += signalSeverity(signal.severity);
    unique.add(signal.id);
  }

  return {
    tenantId,
    totalSignals: signals.length,
    criticalSignals: signals.filter((entry) => entry.severity === 'critical').length,
    averageSeverity: signals.length > 0 ? weighted / signals.length : 0,
    uniqueSignals: unique.size,
  };
};

const buildGovernanceSignals = (tenantId: TenantId, signals: readonly RecoverySignal[], band: SeverityBand): readonly GovernanceSignal[] => {
  return signals.map((signal) => ({
    id: signal.id as unknown as GovernanceSignal['id'],
    metric: signal.class,
    severity: band,
    value: signalSeverity(signal.severity),
    tags: [signal.class, `tenant:${tenantId}`],
    observedAt: signal.createdAt,
  }));
};

const buildGovernanceProfile = (tenantId: TenantId, band: SeverityBand, runbooks: readonly CommandRunbook[]): PolicyProfile => {
  const allowed: Record<SeverityBand, readonly string[]> = {
    low: ['low'],
    medium: ['low', 'medium'],
    high: ['low', 'medium', 'high'],
    critical: ['low', 'medium', 'high', 'critical'],
  };

  return {
    policyId: createGovernanceTenantId(`${tenantId}-policy`) as unknown as PolicyProfile['policyId'],
    tenantId: createGovernanceTenantId(tenantId),
    name: `Recovery policy ${tenantId}`,
    domain: 'recovery-lab',
    state: 'active',
    maxConcurrent: Math.min(10, Math.max(1, runbooks.length)),
    maxCriticality: runbooks.length,
    windowsByBand: {
      low: runbooks.map((runbook) => `${runbook.id}:low` as PolicyProfile['windowsByBand']['low'][number]),
      medium: runbooks.map((runbook) => `${runbook.id}:medium` as PolicyProfile['windowsByBand']['medium'][number]),
      high: runbooks.map((runbook) => `${runbook.id}:high` as PolicyProfile['windowsByBand']['high'][number]),
      critical: runbooks.map((runbook) => `${runbook.id}:critical` as PolicyProfile['windowsByBand']['critical'][number]),
    },
    rules: allowed[band].map((item, index) => ({
      id: `${tenantId}:rule-${index}` as PolicyRule['id'],
      tenantId: createGovernanceTenantId(tenantId),
      policyId: createGovernanceTenantId(`${tenantId}-policy`) as unknown as PolicyRule['policyId'],
      scope: 'global',
      code: `allow-${item}`,
      condition: `band=${item}`,
      penaltyPoints: 100 - index * 10,
      enabled: true,
      createdAt: new Date().toISOString(),
    } as PolicyRule)),
  };
};

export const buildGovernanceDraft = (
  tenantId: TenantId,
  runbooks: readonly CommandRunbook[],
  signals: readonly RecoverySignal[],
  topology: WorkloadTopology,
  band: SeverityBand,
): GovernanceDraft => {
  const profile = buildGovernanceProfile(tenantId, band, runbooks);
  return {
    tenantId,
    profile,
    windows: [],
    rules: profile.rules,
    topology,
    signalDigest: summarizeGovernanceSignals(tenantId, signals),
    generatedAt: new Date().toISOString(),
  };
};

export const evaluateGovernanceDecision = (
  tenantId: TenantId,
  runbooks: readonly CommandRunbook[],
  topology: WorkloadTopology,
  plan: OrchestrationPlan | null,
  signals: readonly RecoverySignal[],
  band: SeverityBand,
): GovernanceDecision => {
  const profile = buildGovernanceProfile(tenantId, band, runbooks);
  const rules = profile.rules;
  const windows = buildReadinessEnvelope({
    tenantId: createGovernanceTenantId(tenantId),
    timestamp: new Date().toISOString(),
    domain: 'recovery-stress',
    region: 'us-east-1',
    state: 'active',
  }).windows;

  const governanceContext: GovernanceContext = {
    tenantId: createGovernanceTenantId(tenantId),
    timestamp: new Date().toISOString(),
    domain: topology.tenantId,
    region: 'global',
    state: 'active',
  };

  const governanceSignals = buildGovernanceSignals(tenantId, signals, band);
  const matrix = evaluateGovernanceMatrix(governanceContext, [profile]);
  const envelopes = buildGovernanceEnvelope(governanceContext, [profile]);
  const snapshot = evaluateGovernance({
    context: governanceContext,
    profile,
    signals: governanceSignals,
    profileList: [profile],
    windows,
    rules,
  });

  return {
    tenantId,
    matrix,
    rankings: topRankedPolicies([profile]),
    signals: [...governanceSignals],
    complianceReady: snapshot.readiness > 60 && snapshot.policyCoverage > 50 && envelopes.policies.length > 0 && plan !== null,
  };
};

export const buildStabilityEnvelope = (
  tenantId: TenantId,
  runbooks: readonly CommandRunbook[],
  plan: OrchestrationPlan | null,
): StabilityEnvelope => {
  const profile = buildReadinessEnvelope({
    tenantId: createGovernanceTenantId(tenantId),
    timestamp: new Date().toISOString(),
    domain: 'recovery-stability',
    region: 'us-east-1',
    state: 'active',
  });

  return {
    tenantId,
    profile,
    runbooks,
    activePlanWindows: plan?.schedule.length ?? 0,
  };
};

export const buildGovernanceMatrixForTopology = (
  tenantId: TenantId,
  runbooks: readonly CommandRunbook[],
  topology: WorkloadTopology,
  signals: readonly RecoverySignal[],
): ReturnType<typeof evaluateGovernanceMatrix> => {
  const draft = buildGovernanceDraft(tenantId, runbooks, signals, topology, 'critical');
  const context: GovernanceContext = {
    tenantId: createGovernanceTenantId(tenantId),
    timestamp: new Date().toISOString(),
    domain: topology.tenantId,
    region: 'global',
    state: 'active',
  };

  return evaluateGovernanceMatrix(context, [draft.profile]);
};
