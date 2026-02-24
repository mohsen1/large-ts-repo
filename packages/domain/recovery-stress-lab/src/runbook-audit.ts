import {
  CommandRunbook,
  CommandRunbookId,
  RecoverySignal,
  TenantId,
  WorkloadTarget,
  WorkloadTopology,
} from './models';
import { mapTargetsToNodes } from './topology-intelligence';

export type AuditState = 'pass' | 'warn' | 'fail';

export interface RunbookAuditEntry {
  readonly runbookId: CommandRunbookId;
  readonly tenantId: TenantId;
  readonly status: AuditState;
  readonly stepCount: number;
  readonly maxDependencySignalCount: number;
  readonly messageSummary: readonly string[];
}

export interface RunbookPlanAudit {
  readonly tenantId: TenantId;
  readonly generatedAt: string;
  readonly status: AuditState;
  readonly planReady: boolean;
  readonly messages: readonly string[];
  readonly runbooks: readonly RunbookAuditEntry[];
  readonly signals: readonly RecoverySignal[];
  readonly topology: WorkloadTopology;
}

interface AuditOptions {
  readonly tenantId: TenantId;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly targets: readonly WorkloadTarget[];
}

const runbookMessages = (runbook: CommandRunbook): string[] => {
  const messages: string[] = [];
  if (runbook.steps.length === 0) {
    messages.push(`runbook ${runbook.name} has no steps`);
  }
  if (!runbook.steps.some((step) => step.phase === 'observe')) {
    messages.push(`runbook ${runbook.name} has no observe phase`);
  }
  if (runbook.steps.some((step) => step.estimatedMinutes > 180)) {
    messages.push(`runbook ${runbook.name} has long step`);
  }
  return messages;
};

const summarizeTopology = (targets: readonly WorkloadTarget[]): WorkloadTopology => {
  const coreTopology = mapTargetsToNodes(targets);
  return {
    tenantId: targets[0]?.tenantId ?? ('tenant' as TenantId),
    nodes: coreTopology.nodes,
    edges: coreTopology.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      coupling: edge.coupling,
      reason: edge.reason,
    })),
  };
};

const summarizeSignals = (signals: readonly RecoverySignal[]): number => signals.reduce((sum, signal) => sum + signal.severity.length, 0);

export const auditRunbooks = (input: AuditOptions): RunbookPlanAudit => {
  const topology = summarizeTopology(input.targets);
  const runbooks = input.runbooks.map((runbook) => {
    const messages = runbookMessages(runbook);
    const signalPressure = runbook.steps.reduce((acc, step) => Math.max(acc, step.requiredSignals.length), 0);

    let state: AuditState = 'pass';
    if (messages.length > 2) {
      state = 'fail';
    } else if (messages.length > 0) {
      state = 'warn';
    }

    return {
      runbookId: runbook.id,
      tenantId: input.tenantId,
      status: state,
      stepCount: runbook.steps.length,
      maxDependencySignalCount: signalPressure,
      messageSummary: messages,
    };
  });

  const topologyPressure = topology.edges.length + topology.nodes.length;
  const signalLoad = input.signals.reduce((acc, signal) => acc + signal.severity.length, 0);
  const signalSeveritySum = summarizeSignals(input.signals);

  const status: AuditState =
    runbooks.some((entry) => entry.status === 'fail') || topologyPressure === 0 || signalLoad > 20 || signalSeveritySum > 20
      ? 'fail'
      : runbooks.some((entry) => entry.status === 'warn')
        ? 'warn'
        : 'pass';

  const messages = [
    ...runbooks.flatMap((entry) => entry.messageSummary),
    `runbooks:${runbooks.length}`,
    `signals:${input.signals.length}`,
    `signalLoad:${signalLoad}`,
    `signalSeverity:${signalSeveritySum}`,
    `topologyNodes:${topology.nodes.length}`,
    `topologyEdges:${topology.edges.length}`,
  ];

  return {
    tenantId: input.tenantId,
    generatedAt: new Date().toISOString(),
    status,
    planReady: status !== 'fail',
    messages,
    runbooks,
    signals: input.signals,
    topology,
  };
};

export const summarizeRunbookAudit = (audit: RunbookPlanAudit): readonly string[] => {
  const grouped = {
    pass: audit.runbooks.filter((entry) => entry.status === 'pass').length,
    warn: audit.runbooks.filter((entry) => entry.status === 'warn').length,
    fail: audit.runbooks.filter((entry) => entry.status === 'fail').length,
  };

  return [
    `tenant=${audit.tenantId}`,
    `status=${audit.status}`,
    `ready=${audit.planReady}`,
    `runbooks=${audit.runbooks.length}`,
    `pass=${grouped.pass}`,
    `warn=${grouped.warn}`,
    `fail=${grouped.fail}`,
    `signals=${audit.signals.length}`,
    `nodes=${audit.topology.nodes.length}`,
    `edges=${audit.topology.edges.length}`,
    `notes=${audit.messages.slice(0, 6).join('|')}`,
  ];
};
