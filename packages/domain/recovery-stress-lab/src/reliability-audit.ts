import { OrchestrationPlan, RecoverySimulationResult, RecoverySignal, TenantId, CommandRunbook } from './models';
import { summarizeSignals } from './stress-analytics';
import { compareSimulations } from './simulation';
import { buildReadinessMatrix, compareReadinessPlans } from './planning-matrix';
import { dedupeSignalsByFingerprint, buildSignalCadenceProfile } from './signal-intelligence';

export interface ReliabilityFinding {
  readonly code: string;
  readonly title: string;
  readonly details: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ReliabilityReport {
  readonly tenantId: TenantId;
  readonly signalCount: number;
  readonly runbookCount: number;
  readonly hasPlan: boolean;
  readonly hasSimulation: boolean;
  readonly findings: ReadonlyArray<ReliabilityFinding>;
  readonly planDelta: {
    readonly changed: boolean;
    readonly message: string;
    readonly deltaRunbookCount: number;
  };
  readonly matrixScore: number;
}

const severityFromString = (value: string): ReliabilityFinding['severity'] => {
  if (value === 'critical') return 'critical';
  if (value === 'high') return 'high';
  if (value === 'medium') return 'medium';
  return 'low';
};

const buildFinding = (
  code: string,
  title: string,
  details: string,
  severity: ReliabilityFinding['severity'],
): ReliabilityFinding => ({
  code,
  title,
  details,
  severity,
});

export const auditWorkspace = (
  tenantId: TenantId,
  plan: OrchestrationPlan | null,
  simulation: RecoverySimulationResult | null,
  runbooks: readonly CommandRunbook[],
  signals: readonly RecoverySignal[],
  previousPlan: OrchestrationPlan | null,
): ReliabilityReport => {
  const findings: ReliabilityFinding[] = [];

  const dedupedSignals = dedupeSignalsByFingerprint(signals);
  const cadence = buildSignalCadenceProfile(tenantId, dedupedSignals);
  const signalDigest = summarizeSignals(tenantId, dedupedSignals);
  const matrix = buildReadinessMatrix({
    tenantId,
    runbooks,
    signals,
    topology: {
      tenantId,
      nodes: [],
      edges: [],
    },
  });

  if (signalDigest.criticalSignals > 0 && !plan) {
    findings.push(
      buildFinding(
        'critical-without-plan',
        'Critical signals without a plan',
        'Create a plan before execution, especially when critical signals are active',
        'critical',
      ),
    );
  }

  if (runbooks.length === 0) {
    findings.push(buildFinding('no-runbooks', 'No runbooks selected', 'Select runbooks before simulation', 'high'));
  }

  if (cadence.totalSignals === 0) {
    findings.push(buildFinding('no-signals', 'No signals available', 'Inject synthetic signals before planning', 'medium'));
  }

  if (cadence.uniqueWorkloads.length < 1) {
    findings.push(buildFinding('no-workloads', 'No workload targets', 'Provide topology inputs with active workloads', 'high'));
  }

  const coverageGap = matrix.total < 0.2;
  if (coverageGap) {
    findings.push(buildFinding('coverage-gap', 'Low matrix score', 'Add staggered runbooks or phases to increase coverage', 'low'));
  }

  const simulationWarnings = simulation
    ? compareSimulations(simulation, simulation)
    : ['No simulation available'];

  for (const message of simulationWarnings.slice(0, 3)) {
    findings.push(buildFinding('simulation-signal', 'Simulation signal', message, 'medium'));
  }

  const planDelta = compareReadinessPlans({ previous: previousPlan, candidate: plan ?? (previousPlan ?? null as unknown as OrchestrationPlan), band: 'low' });

  return {
    tenantId,
    signalCount: dedupedSignals.length,
    runbookCount: runbooks.length,
    hasPlan: Boolean(plan),
    hasSimulation: Boolean(simulation),
    findings,
    planDelta,
    matrixScore: matrix.total,
  };
};

export const prioritizeFindings = (findings: readonly ReliabilityFinding[]): ReadonlyArray<ReliabilityFinding> => {
  const severityWeight: Readonly<Record<ReliabilityFinding['severity'], number>> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...findings].sort((left, right) => {
    const leftWeight = severityWeight[severityFromString(left.severity)];
    const rightWeight = severityWeight[severityFromString(right.severity)];
    if (leftWeight === rightWeight) {
      return left.code.localeCompare(right.code);
    }
    return rightWeight - leftWeight;
  });
};

export const summarizeAudit = (report: ReliabilityReport): string => {
  const critical = report.findings.filter((finding) => finding.severity === 'critical').length;
  const high = report.findings.filter((finding) => finding.severity === 'high').length;
  const medium = report.findings.filter((finding) => finding.severity === 'medium').length;
  return `tenant=${report.tenantId} signals=${report.signalCount} runbooks=${report.runbookCount} plan=${report.hasPlan ? 'yes' : 'no'} simulation=${report.hasSimulation ? 'yes' : 'no'} findings[c=${critical},h=${high},m=${medium}]`;
};
