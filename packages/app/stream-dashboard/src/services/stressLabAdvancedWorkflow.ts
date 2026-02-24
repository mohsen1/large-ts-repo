import { useMemo } from 'react';
import { type NoInfer } from '@shared/type-level';
import {
  toRenderModel,
  buildAdvancedTopologyGraph,
  createWorkflowRunId,
  type WorkflowInputEnvelope,
  type WorkflowExecutionResult,
  type WorkspaceSeedInput,
  runAdvancedWorkflow,
  type WorkflowExecutionTrace,
  type WorkloadTarget,
} from '@domain/recovery-stress-lab';
import {
  type CommandRunbook,
  type RecoverySignal,
  type TenantId,
  createSignalId,
  createWorkloadId,
  createRunbookId,
  createTenantId,
  WorkloadId,
} from '@domain/recovery-stress-lab';

import { type WorkflowRenderModel } from '@domain/recovery-stress-lab';

export interface AdvancedWorkflowInput {
  readonly tenantId: TenantId;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly targets: readonly WorkloadTarget[];
  readonly requestedBand: 'low' | 'medium' | 'high' | 'critical';
  readonly mode: 'conservative' | 'adaptive' | 'agile';
}

export interface AdvancedWorkflowRunResult {
  readonly runId: string;
  readonly render: WorkflowRenderModel;
  readonly result: WorkflowExecutionResult;
  readonly topologyNodeCount: number;
  readonly topologyEdgeCount: number;
}

export interface AdvancedWorkflowRunMeta {
  readonly runId: string;
  readonly source: TenantId;
  readonly topSignalIds: readonly string[];
  readonly traceCount: number;
}

type AdvancedWorkflowInputRuntime = Pick<
  AdvancedWorkflowInput,
  'tenantId' | 'requestedBand' | 'mode'
> & {
  readonly runbooks: readonly { readonly id: string; readonly title: string; readonly severityBand: string }[];
  readonly signals: readonly RecoverySignal[];
  readonly targets: readonly WorkloadTarget[];
};

const deriveSeed = (input: AdvancedWorkflowInput): WorkspaceSeedInput => ({
  tenantId: input.tenantId,
  runbooks: input.runbooks.map((runbook) => ({
    id: String(runbook.id),
    severityBand: input.requestedBand,
    runbookTitle: runbook.name,
  })),
  signals: input.signals.map((signal) => ({
    ...signal,
    id: createSignalId(String(signal.id)),
    class: signal.class,
    severity: signal.severity,
    title: signal.title,
    createdAt: signal.createdAt,
    metadata: signal.metadata,
  })),
  targets: input.targets.map((target) => ({
    tenantId: target.tenantId,
    workloadId: String(target.workloadId),
    commandRunbookId: String(target.commandRunbookId),
    name: target.name,
    criticality: target.criticality,
    region: target.region,
    azAffinity: target.azAffinity,
    baselineRtoMinutes: target.baselineRtoMinutes,
    dependencies: target.dependencies.map((dependency) => String(dependency)),
  })),
  requestedBand: input.requestedBand,
  mode: input.mode,
});

const toInputEnvelope = (input: AdvancedWorkflowInputRuntime): WorkflowInputEnvelope => ({
  runId: createWorkflowRunId(input.tenantId),
  workspaceTenantId: createTenantId(String(input.tenantId)),
  startedAt: new Date().toISOString(),
  stage: 'input',
  route: 'input:phase',
  payload: {
    workspace: {
      tenantId: createTenantId(String(input.tenantId)),
      runbooks: input.runbooks.map((runbook) => ({
        id: createRunbookId(runbook.id),
        severityBand: 'medium',
        runbookTitle: runbook.title,
      })),
      signals: input.signals,
      targets: input.targets,
      requestedBand: input.requestedBand,
      mode: input.mode,
    },
  },
  tag: 'advanced-workflow#input#event',
});

export const extractTopologyFingerprint = (
  input: AdvancedWorkflowInput,
): { readonly runId: string; readonly nodes: number; readonly edges: number } => {
  const topology = buildAdvancedTopologyGraph({
    tenantId: input.tenantId,
    runbooks: input.runbooks.map((runbook) => ({
      id: createRunbookId(String(runbook.id)),
      severityBand: input.requestedBand,
      runbookTitle: runbook.name,
    })),
    signals: input.signals,
    targets: input.targets,
    requestedBand: input.requestedBand,
    mode: input.mode,
  });
  return {
    runId: createWorkflowRunId(input.tenantId),
    nodes: topology.nodes.length,
    edges: topology.edges.length,
  };
};

export const buildWorkflowTraceDigest = (traces: readonly WorkflowExecutionTrace[]): string => {
  return traces
    .map((trace) => `${trace.sequence}:${trace.pluginId}:${trace.ok}`)
    .join('|');
};

const dedupeSignals = (signals: readonly RecoverySignal[]): readonly RecoverySignal[] => {
  const seen = new Set<string>();
  const ordered = [...signals].sort((first, second) => String(first.severity).localeCompare(String(second.severity)));
  return ordered.filter((signal) => {
    if (seen.has(signal.id)) {
      return false;
    }
    seen.add(signal.id);
    return true;
  });
};

export const runAdvancedWorkflowSession = async (
  input: AdvancedWorkflowInput,
  override: Partial<Pick<AdvancedWorkflowInput, 'requestedBand' | 'mode'>> = {},
): Promise<AdvancedWorkflowRunResult> => {
  const nextInput = { ...input, ...override };
  const normalizedInput: AdvancedWorkflowInput = {
    ...nextInput,
    requestedBand: nextInput.requestedBand ?? input.requestedBand,
    mode: nextInput.mode ?? input.mode,
    runbooks: [...input.runbooks],
    signals: dedupeSignals(input.signals),
    targets: [...input.targets],
    tenantId: createTenantId(String(input.tenantId)),
  };

  const envelope = toInputEnvelope({
    tenantId: normalizedInput.tenantId,
    requestedBand: normalizedInput.requestedBand,
    mode: normalizedInput.mode,
    runbooks: normalizedInput.runbooks.map((runbook) => ({
      id: String(runbook.id),
      title: runbook.name,
      severityBand: normalizedInput.requestedBand,
    })),
    signals: normalizedInput.signals,
    targets: normalizedInput.targets,
  });

  const runResult = await runAdvancedWorkflow(envelope);
  if (!runResult.ok) {
    throw new Error(runResult.error);
  }

  const render = toRenderModel(runResult.value);
  const topology = extractTopologyFingerprint(normalizedInput);
  return {
    runId: runResult.value.runId,
    render,
    result: runResult.value,
    topologyNodeCount: topology.nodes,
    topologyEdgeCount: topology.edges,
  };
};

export const useAdvancedWorkflowPlan = <TInput extends AdvancedWorkflowInput>(input: NoInfer<TInput>) =>
  useMemo(() => {
    const signature = `${input.tenantId}:${input.runbooks.length}:${input.signals.length}`;
    return {
      signature,
      runIdHint: createWorkflowRunId(input.tenantId),
      canRun: input.signals.length > 0,
    };
  }, [input.tenantId, input.runbooks.length, input.signals.length]);

export const summarizeAdvancedRun = (
  result: AdvancedWorkflowRunResult,
): AdvancedWorkflowRunMeta => ({
  runId: result.runId,
  source: result.result.tenantId,
  topSignalIds: result.render.stageRows.slice(0, 3).map((row: { readonly stage: string }) => row.stage),
  traceCount: result.result.traces.length,
});

export const buildRecoveryTargetsFromSignals = (
  tenantId: TenantId,
  signals: readonly RecoverySignal[],
): readonly WorkloadTarget[] => {
  return signals.map((signal, index) => ({
    tenantId,
    workloadId: createWorkloadId(`target-${tenantId}-${index}`),
    commandRunbookId: createRunbookId(String(signal.id)),
    name: signal.title,
    criticality: (((index % 5) + 1) as WorkloadTarget['criticality']),
    region: 'us-east-1',
    azAffinity: ['zone-a'],
    baselineRtoMinutes: 15,
    dependencies: index === 0 ? [] : [createWorkloadId(`target-${tenantId}-${index - 1}`)],
  }));
};
