import { createGovernanceTenantId } from '@domain/recovery-lab-governance';
import {
  CommandRunbook,
  RecoverySignal,
  TenantId,
  WorkloadTopology,
  WorkloadTopologyNode,
  WorkloadTarget,
  SeverityBand,
  createRunbookId,
  createWorkloadId,
} from './models';
import {
  summarizeGovernanceSignals,
  buildGovernanceDraft,
  evaluateGovernance,
  buildReadinessEnvelope,
  evaluateGovernanceDecision,
} from './governance-overview';
import type { GovernanceDecision } from './governance-overview';
import { inferRiskBandFromSignals } from './topology-intelligence';
import { auditRunbooks, summarizeRunbookAudit } from './runbook-audit';
import { evaluateGovernanceMatrix } from '@domain/recovery-lab-governance';
import type { GovernanceSignal } from '@domain/recovery-lab-governance';

export type GovernanceWindowState = 'green' | 'yellow' | 'red';

export interface GovernanceRunWindow {
  readonly at: string;
  readonly tenantId: TenantId;
  readonly coverage: number;
  readonly readiness: number;
  readonly warningCount: number;
  readonly state: GovernanceWindowState;
}

export interface GovernanceMatrixBundle {
  readonly tenantId: TenantId;
  readonly runId: string;
  readonly runbooks: readonly CommandRunbook['id'][];
  readonly profileId: string;
  readonly windows: readonly GovernanceRunWindow[];
  readonly latestReadiness: number;
  readonly readinessTrend: readonly number[];
  readonly activeSignals: number;
  readonly riskBand: SeverityBand;
  readonly complianceReady: boolean;
  readonly topPolicies: readonly string[];
  readonly audit: readonly string[];
  readonly governanceDecision: GovernanceDecision;
}

const classifyWindowState = (readiness: number): GovernanceWindowState => {
  if (readiness >= 80) return 'green';
  if (readiness >= 50) return 'yellow';
  return 'red';
};

const buildContext = (tenantId: TenantId, domain: string) => ({
  tenantId: createGovernanceTenantId(tenantId),
  timestamp: new Date().toISOString(),
  domain,
  region: 'global',
  state: 'active' as const,
});

const buildWindowReadiness = (
  tenantId: TenantId,
  snapshot: ReturnType<typeof evaluateGovernance>,
  signalDigest: ReturnType<typeof summarizeGovernanceSignals>,
  index: number,
): GovernanceRunWindow => {
  const base = index * 5;
  const boundedReadiness = Math.max(
    0,
    Math.min(100, snapshot.readiness - base + Math.min(40, signalDigest.totalSignals)),
  );
  const readiness = Number(boundedReadiness.toFixed(2));

  return {
    at: new Date(Date.now() + index * 60 * 1000).toISOString(),
    tenantId,
    coverage: snapshot.policyCoverage + index,
    readiness: Number(readiness),
    warningCount: snapshot.warning.length + index,
    state: classifyWindowState(Number(readiness)),
  };
};

export const buildGovernanceSnapshotBundle = (
  tenantId: TenantId,
  runbooks: readonly CommandRunbook[],
  signals: readonly RecoverySignal[],
  topology: WorkloadTopology,
  domain = 'recovery-stress',
): GovernanceMatrixBundle => {
  const band = inferRiskBandFromSignals(signals);
  const draft = buildGovernanceDraft(tenantId, runbooks, signals, topology, band);
  const profile = draft.profile;
  const context = buildContext(tenantId, domain);
  const readinessEnvelope = buildReadinessEnvelope(context);
  const signalDigest = summarizeGovernanceSignals(tenantId, signals);
  const governanceSignals = signals.map<GovernanceSignal>((signal) => ({
    id: signal.id as unknown as GovernanceSignal['id'],
    metric: signal.class,
    severity: band,
    value: signal.severity === 'critical' ? 100 : signal.severity === 'high' ? 75 : signal.severity === 'medium' ? 50 : 25,
    tags: [signal.class, `tenant:${tenantId}`],
    observedAt: signal.createdAt,
  }));

  const readiness = evaluateGovernance({
    context,
    profile,
    signals: governanceSignals,
    profileList: [profile],
    windows: readinessEnvelope.windows,
    rules: profile.rules,
  });

  const matrix = evaluateGovernanceMatrix(context, [profile]);
  const decision = evaluateGovernanceDecision(tenantId, runbooks, topology, null, signals, band);

  const windows = matrix.activeProfiles.slice(0, 5).map((_profile, index) => ({
    ...buildWindowReadiness(tenantId, readiness, signalDigest, index),
    at: new Date(Date.now() + index * 60 * 1000).toISOString(),
    tenantId,
  }));

  const targets = topology.nodes.length > 0
    ? topology.nodes.map((node: WorkloadTopologyNode) => ({
      tenantId,
      workloadId: node.id,
      commandRunbookId: createRunbookId(`runbook-${node.id}`),
      name: node.name,
      criticality: node.criticality as WorkloadTarget['criticality'],
      region: 'global',
      azAffinity: [],
      baselineRtoMinutes: 20,
      dependencies: [],
    }))
    : [
      {
        tenantId,
        workloadId: createWorkloadId(`${tenantId}:fallback`),
        commandRunbookId: runbooks[0]?.id ?? createRunbookId('fallback-runbook'),
        name: 'Fallback workload',
        criticality: 1 as WorkloadTarget['criticality'],
        region: 'global',
        azAffinity: [],
        baselineRtoMinutes: 20,
        dependencies: [],
      },
    ];

  const auditInput = auditRunbooks({
    tenantId,
    runbooks,
    signals,
    targets,
  });

  return {
    tenantId,
    runId: `${tenantId}:governance-${context.timestamp}`,
    runbooks: runbooks.map((runbook) => runbook.id),
    profileId: String(profile.policyId),
    windows,
    latestReadiness: windows.length > 0 ? windows[windows.length - 1].readiness : readiness.readiness,
    readinessTrend: windows.map((entry) => entry.readiness),
    activeSignals: signalDigest.totalSignals,
    riskBand: band,
    complianceReady: decision.complianceReady,
    topPolicies: matrix.activeProfiles.map((entry) => `${entry.policyId}:${entry.tenantId}`),
    audit: summarizeRunbookAudit(auditInput),
    governanceDecision: decision,
  };
};

export const summarizeGovernanceMatrix = (bundle: GovernanceMatrixBundle): readonly string[] => {
  const warnings = bundle.windows.map((window) => `${window.at}:${window.state}:${window.warningCount}`);
  const averageReadiness = bundle.readinessTrend.length === 0
    ? 0
    : bundle.readinessTrend.reduce((acc, value) => acc + value, 0) / bundle.readinessTrend.length;

  return [
    `tenant=${bundle.tenantId}`,
    `run=${bundle.runId}`,
    `profile=${bundle.profileId}`,
    `runbooks=${bundle.runbooks.length}`,
    `activeSignals=${bundle.activeSignals}`,
    `latestReadiness=${bundle.latestReadiness.toFixed(2)}`,
    `averageReadiness=${averageReadiness.toFixed(2)}`,
    `windows=${bundle.windows.length}`,
    `riskBand=${bundle.riskBand}`,
    `compliance=${bundle.complianceReady}`,
    `warnings=${warnings.join('|')}`,
    `top=${bundle.topPolicies.join('|')}`,
  ];
};
