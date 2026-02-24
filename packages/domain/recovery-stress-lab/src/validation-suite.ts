import { CommandRunbook, OrchestrationPlan, RecoverySignal, WorkloadTopology, TenantId, SeverityBand } from './models';
import {
  PolicyEnvelope,
  evaluateGovernance,
  buildEnvelope,
  createGovernanceTenantId,
} from '@domain/recovery-lab-governance';
import { evaluateGovernanceDecision, summarizeGovernanceSignals, buildGovernanceDraft } from './governance-overview';

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly remediation: string;
}

export interface TopologyValidation {
  readonly tenantId: TenantId;
  readonly valid: boolean;
  readonly issues: ReadonlyArray<ValidationIssue>;
  readonly counts: {
    readonly nodes: number;
    readonly edges: number;
    readonly activeNodes: number;
  };
}

export interface RunbookValidation {
  readonly tenantId: TenantId;
  readonly valid: boolean;
  readonly issues: ReadonlyArray<ValidationIssue>;
  readonly warnings: ReadonlyArray<ValidationIssue>;
}

export interface SignalValidation {
  readonly tenantId: TenantId;
  readonly valid: boolean;
  readonly issues: ReadonlyArray<ValidationIssue>;
}

interface RankedPolicy {
  readonly policyId: string;
  readonly score: number;
}

export interface GovernanceBundle {
  readonly tenantId: TenantId;
  readonly policyCount: number;
  readonly topRanked: readonly RankedPolicy[];
  readonly envelopes: readonly PolicyEnvelope[];
  readonly signalDigest: ReturnType<typeof summarizeGovernanceSignals>;
  readonly snapshotWarnings: readonly string[];
}

const issue = (code: string, message: string, remediation: string): ValidationIssue => ({ code, message, remediation });

const isPositiveInt = (value: number): boolean => Number.isInteger(value) && value > 0;

export const validateTopology = (tenantId: TenantId, topology: WorkloadTopology): TopologyValidation => {
  const issues: ValidationIssue[] = [];
  const nodes = topology.nodes.length;
  const edges = topology.edges.length;
  const activeNodes = topology.nodes.filter((node) => node.active).length;

  if (nodes === 0) {
    issues.push(issue('topology-empty', 'Topology has no nodes', 'Provision at least one target workload before planning'));
  }
  if (edges === 0) {
    issues.push(issue('topology-disconnected', 'Topology has no dependency edges', 'Add explicit dependency relationships for accurate impact projection'));
  }
  if (!topology.tenantId || String(topology.tenantId).trim() === '') {
    issues.push(issue('topology-no-tenant', 'Topology tenant missing', 'Set tenantId on topology to tenant root identifier'));
  }

  for (const node of topology.nodes) {
    if (!Number.isFinite(node.criticality) || !isPositiveInt(node.criticality) || node.criticality > 5 || node.criticality < 1) {
      issues.push(issue('topology-criticality', `Invalid criticality for workload ${node.id}`, 'Keep criticality between 1 and 5'));
    }
    if (!node.name.trim()) {
      issues.push(issue('topology-name', `Workload ${node.id} missing name`, 'Provide canonical workload naming'));
    }
    if (node.name.length > 64) {
      issues.push(issue('topology-name-length', `Workload ${node.id} has long name`, 'Trim workload name to <= 64 chars'));
    }
  }

  for (const edge of topology.edges) {
    if (!Number.isFinite(edge.coupling) || edge.coupling <= 0 || edge.coupling > 1) {
      issues.push(issue('topology-coupling', `Invalid coupling on edge ${edge.from}->${edge.to}`, 'Clamp coupling to (0,1]'));
    }
    if (!edge.reason.trim()) {
      issues.push(issue('topology-edge-reason', `Edge ${edge.from}->${edge.to} has missing reason`, 'Add human-readable rationale'));
    }
    if (edge.from === edge.to) {
      issues.push(issue('topology-self-edge', `Self edge detected ${edge.from}`, 'Remove or gate self-dependency'));
    }
  }

  return {
    tenantId,
    valid: issues.length === 0,
    issues,
    counts: {
      nodes,
      edges,
      activeNodes,
    },
  };
};

export const validateRunbooks = (tenantId: TenantId, runbooks: readonly CommandRunbook[], band: SeverityBand): RunbookValidation => {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const maxSteps = band === 'critical' ? 12 : band === 'high' ? 10 : band === 'medium' ? 8 : 6;

  if (runbooks.length === 0) {
    issues.push(issue('runbook-empty', 'No runbooks selected', 'Select at least one runbook'));
  }
  for (const runbook of runbooks) {
    if (runbook.tenantId !== tenantId) {
      issues.push(issue('runbook-tenant', `Runbook ${runbook.id} tenant mismatch`, 'Align runbook tenant with session tenant'));
    }
    if (!runbook.name.trim()) {
      issues.push(issue('runbook-name', `Runbook ${runbook.id} has missing name`, 'Set concise runbook name'));
    }
    if (runbook.steps.length === 0) {
      warnings.push(issue('runbook-no-steps', `Runbook ${runbook.name} has no steps`, 'Add at least observe/isolate steps'));
    }
    if (runbook.steps.length > maxSteps) {
      warnings.push(issue('runbook-long', `Runbook ${runbook.name} has too many steps`, `Reduce below ${maxSteps} for ${band} band`));
    }
    for (const [index, step] of runbook.steps.entries()) {
      if (step.estimatedMinutes <= 0) {
        issues.push(issue('runbook-step-duration', `Step ${step.title} duration invalid`, 'Set positive estimatedMinutes'));
      }
      if (!step.title.trim()) {
        issues.push(issue('runbook-step-name', `Runbook ${runbook.id} step ${index} has no title`, 'Describe step intent'));
      }
    }
  }

  return {
    tenantId,
    valid: issues.length === 0,
    issues,
    warnings,
  };
};

export const validateSignals = (tenantId: TenantId, signals: readonly RecoverySignal[]): SignalValidation => {
  const issues: ValidationIssue[] = [];

  if (signals.length === 0) {
    issues.push(issue('signal-empty', 'No signals present', 'Inject synthetic signal when running simulation bootstrap'));
  }
  const severitySet = new Set<RecoverySignal['severity']>();
  for (const signal of signals) {
    if (!signal.title.trim()) {
      issues.push(issue('signal-title', `Signal ${signal.id} missing title`, 'Describe detected condition'));
    }
    if (!signal.class) {
      issues.push(issue('signal-class', `Signal ${signal.id} missing class`, 'Add class to classify signal'));
    }
    if (!signal.severity) {
      issues.push(issue('signal-severity', `Signal ${signal.id} missing severity`, 'Set severity band'));
    }
    if (String(signal.id).trim() === '') {
      issues.push(issue('signal-id', 'Signal id is empty', 'Use stable branded identifier'));
    }
    if (!signal.metadata || typeof signal.metadata !== 'object') {
      issues.push(issue('signal-metadata', `Signal ${signal.id} missing metadata`, 'Include metadata payload'));
    }
    severitySet.add(signal.severity);
  }

  if (!severitySet.has('critical') && !severitySet.has('high') && signals.length > 0) {
    issues.push(issue('signal-no-severe', 'No severe signals', 'Consider widening signal set for stress confidence'));
  }

  return {
    tenantId,
    valid: issues.length === 0,
    issues,
  };
};

export const compileValidationBundle = (
  tenantId: TenantId,
  input: {
    topology: WorkloadTopology;
    runbooks: readonly CommandRunbook[];
    signals: readonly RecoverySignal[];
    band: SeverityBand;
    plan?: OrchestrationPlan;
    signalDigest?: ReturnType<typeof summarizeGovernanceSignals>;
  },
) => {
  const topology = validateTopology(tenantId, input.topology);
  const runbooks = validateRunbooks(tenantId, input.runbooks, input.band);
  const signals = validateSignals(tenantId, input.signals);
  const issues = [...topology.issues, ...runbooks.issues, ...signals.issues];
  const warnings = [...runbooks.warnings];
  const valid = issues.length === 0;

  const profile = buildGovernanceDraft(tenantId, input.runbooks, input.signals, input.topology, input.band).profile;
  const context = {
    tenantId: createGovernanceTenantId(tenantId),
    timestamp: new Date().toISOString(),
    domain: input.topology.tenantId,
    region: 'global',
    state: 'active' as const,
  };
  const governanceSignals = input.signals.map((signal) => ({
    id: signal.id as unknown as any,
    metric: signal.class,
    severity: input.band,
    value: signal.severity === 'critical' ? 100 : signal.severity === 'high' ? 75 : signal.severity === 'medium' ? 50 : 25,
    tags: [signal.class, `tenant:${tenantId}`],
    observedAt: signal.createdAt,
  }));

  const decision = evaluateGovernanceDecision(tenantId, input.runbooks, input.topology, input.plan ?? null, input.signals, input.band);
  const governance = evaluateGovernance({
    context,
    profile,
    signals: governanceSignals,
    profileList: [profile],
    windows: buildEnvelope(context, [profile]).windows,
    rules: profile.rules,
  });

  const bundle: GovernanceBundle = {
    tenantId,
    policyCount: decision.matrix.envelopes.length,
    topRanked: decision.rankings,
    envelopes: decision.matrix.envelopes,
    signalDigest: summarizeGovernanceSignals(tenantId, input.signals),
    snapshotWarnings: governance.warning,
  };

  return {
    tenantId,
    valid,
    issues,
    warnings,
    breakdown: { topology, runbooks, signals },
    governance,
    bundle,
  };
};
