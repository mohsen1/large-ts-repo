import {
  type OrchestrationPlan,
  type RecoverySignal,
  type TenantId,
  type CommandRunbook,
  type WorkloadTopology,
  type StressRunState,
  type WorkloadTarget,
  type RecoverySimulationResult,
  buildScenarioWorkflow,
  compileValidationBundle,
  summarizeSignals,
} from '@domain/recovery-stress-lab';
import type { ScenarioWorkflowOutput } from '@domain/recovery-stress-lab';

type PolicySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface WorkflowInput {
  readonly tenantId: TenantId;
  readonly band: PolicySeverity;
  readonly runbooks: readonly CommandRunbook[];
  readonly targets: readonly WorkloadTarget[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly state: StressRunState | null;
}

export interface WorkflowStep {
  readonly name: string;
  readonly status: 'ok' | 'warn' | 'fail';
  readonly details: string;
}

export interface WorkflowOutput {
  readonly tenantId: TenantId;
  readonly workflow: ScenarioWorkflowOutput;
  readonly valid: boolean;
  readonly topSignals: readonly RecoverySignal['id'][];
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly validationSummary: readonly string[];
  readonly steps: readonly WorkflowStep[];
}

const deriveWorkflowState = (
  runbooks: readonly CommandRunbook[],
  signals: readonly RecoverySignal[],
): 'validated' | 'drafting' => {
  if (runbooks.length === 0 || signals.length === 0) {
    return 'drafting';
  }

  return 'validated';
};

const buildDefaultPlan = (input: WorkflowInput): OrchestrationPlan => {
  const planSchedule = input.runbooks.map((runbook, index) => ({
    runbookId: runbook.id,
    startAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    endAt: new Date(Date.UTC(2026, 0, 1 + index, 0, 45)).toISOString(),
    phaseOrder: ['observe', 'isolate', 'verify'] as const,
  }));

  return {
    tenantId: input.tenantId,
    scenarioName: `workflow-${input.tenantId}`,
    schedule: planSchedule,
    runbooks: [...input.runbooks],
    dependencies: {
      nodes: input.topology.nodes.map((node) => node.id),
      edges: input.topology.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        weight: edge.coupling,
      })),
    },
    estimatedCompletionMinutes: Math.max(1, input.runbooks.length * 10 + (input.signals.length > 0 ? 5 : 2)),
  };
};

const simulateDecision = (input: WorkflowInput, plan: OrchestrationPlan): RecoverySimulationResult | null => {
  if (!plan || plan.runbooks.length === 0) {
    return null;
  }

  const workloadSequence = input.topology.nodes.map((node) => node.id);

  const ticks = plan.schedule.map((entry, index) => {
    const blockedWorkloads = workloadSequence.slice(index).slice(0, 4);
    return {
      timestamp: entry.startAt,
      activeWorkloads: Math.max(0, plan.runbooks.length - index),
      blockedWorkloads: blockedWorkloads,
      confidence: Number((index === 0 ? 1 : Math.max(0.1, 1 - index * 0.08)).toFixed(4)),
    };
  });

  return {
    tenantId: input.tenantId,
    startedAt: new Date().toISOString(),
    endedAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    selectedRunbooks: plan.runbooks.map((runbook) => runbook.id),
    ticks,
    riskScore: Math.max(0, 1 - input.signals.length / 30),
    slaCompliance: Number(Math.min(1, 0.45 + plan.runbooks.length * 0.08 + input.signals.length * 0.02).toFixed(4)),
    notes: plan.runbooks.map((runbook) => `runbook:${runbook.id}`),
  };
};

const runbookTopSignals = (signals: readonly RecoverySignal[]): readonly RecoverySignal['id'][] => {
  if (signals.length === 0) {
    return [];
  }

  const bySeverity = signals
    .slice()
    .sort((left, right) => {
      const score = (entry: RecoverySignal): number => {
        if (entry.severity === 'critical') return 4;
        if (entry.severity === 'high') return 3;
        if (entry.severity === 'medium') return 2;
        return 1;
      };
      return score(right) - score(left);
    })
    .slice(0, 4);

  return bySeverity.map((signal) => signal.id);
};

export const routeWorkflow = (input: WorkflowInput): WorkflowOutput => {
  const topology = input.topology.nodes.length > 0
    ? input.topology
    : {
      tenantId: input.tenantId,
      nodes: input.targets.map((target) => ({
        id: target.workloadId,
        name: target.name,
        ownerTeam: 'stress-lab',
        criticality: target.criticality,
        active: true,
      })),
      edges: input.targets.flatMap((target) => target.dependencies.map((dependency) => ({
        from: dependency,
        to: target.workloadId,
        coupling: 0.5,
        reason: `dependency ${dependency}->${target.workloadId}`,
      }))),
    };

  const workflow = buildScenarioWorkflow({
    tenantId: input.tenantId,
    band: input.band,
    runbooks: input.runbooks,
    signals: input.signals,
    requestedBy: 'recovery-stress-lab-orchestrator',
  });

  const validation = compileValidationBundle(input.tenantId, {
    topology,
    runbooks: input.runbooks,
    signals: input.signals,
    band: input.band,
    plan: input.state?.plan ?? undefined,
    signalDigest: summarizeSignals(input.tenantId, input.signals),
  });

  const plan = input.runbooks.length > 0 ? buildDefaultPlan({ ...input, topology }) : null;
  const simulation = plan ? simulateDecision({ ...input, topology }, plan) : null;
  const state = deriveWorkflowState(input.runbooks, input.signals);

  const steps: WorkflowStep[] = [
    {
      name: 'workflow-state',
      status: state === 'validated' ? 'ok' : 'warn',
      details: `${state} after input checks`,
    },
    {
      name: 'signal-digest',
      status: input.signals.length > 0 ? 'ok' : 'warn',
      details: `signals=${input.signals.length}`,
    },
    {
      name: 'plan-creation',
      status: plan ? 'ok' : 'fail',
      details: plan ? `schedule=${plan.schedule.length}` : 'missing runbooks',
    },
    {
      name: 'simulation',
      status: simulation ? 'ok' : 'warn',
      details: `risk=${simulation?.riskScore ?? 0}`,
    },
  ];

  return {
    tenantId: input.tenantId,
    workflow: {
      ...workflow,
      state,
    },
    valid: validation.valid,
    topSignals: runbookTopSignals(input.signals),
    plan,
    simulation,
    validationSummary: [...validation.issues.slice(0, 6).map((issue) => issue.message)],
    steps,
  };
};

export const summarizeWorkflow = (output: WorkflowOutput): readonly string[] => {
  return [
    `tenant=${output.tenantId}`,
    `state=${output.workflow.state}`,
    `signalWindows=${output.workflow.signalCount}`,
    `runbooks=${output.workflow.runbookCount}`,
    `planWindows=${output.plan ? output.plan.schedule.length : 0}`,
    `valid=${output.valid}`,
    `topSignals=${output.topSignals.length}`,
    ...output.validationSummary,
  ];
};
