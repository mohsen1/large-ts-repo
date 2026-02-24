import { useCallback, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import { useIncidentSignalStream } from './useIncidentSignalStream';
import { executeIncidentOrchestrationStudio, type StudioExecutionResult } from '../services/orchestrator';
import {
  type AssessmentOutput,
  type DiscoveryOutput,
  type IncidentWorkflowInput,
  type OrchestrationOutput,
  type StudioIncidentId,
  type StudioOperatorId,
  type StudioPolicyId,
  type StudioRunId,
  type StudioTenantId,
  type WorkflowSnapshot,
} from '../types';

export type PluginBusEvent = {
  readonly kind: 'progress' | 'diagnostic' | 'warning' | 'error';
  readonly pluginId: string;
  readonly pluginName: string;
  readonly phase: string;
  readonly diagnostics: readonly string[];
};

export interface IncidentStudioWorkspace {
  readonly id: StudioRunId;
  readonly tenantId: StudioTenantId;
  readonly incidentId: StudioIncidentId;
  readonly operatorId: StudioOperatorId;
  readonly discovered: Readonly<DiscoveryOutput | undefined>;
  readonly assessed: Readonly<AssessmentOutput | undefined>;
  readonly snapshot: WorkflowSnapshot | undefined;
  readonly selectedPolicy: StudioPolicyId | undefined;
  readonly policyApproved: boolean;
}

type WorkflowSeed = {
  readonly tenantId: string;
  readonly incidentId: string;
  readonly operatorId: string;
};

type StudioActionState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'complete'; readonly output: OrchestrationOutput }
  | { readonly status: 'failed'; readonly reason: string };

const defaultTemplate = (seed: WorkflowSeed): IncidentWorkflowInput => ({
  tenantId: withBrand(seed.tenantId, 'IncidentTenantId'),
  incidentId: withBrand(seed.incidentId, 'IncidentId'),
  operatorId: withBrand(seed.operatorId, 'OperatorId'),
  window: {
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    timezone: 'UTC',
  },
  urgencyMinutes: 27,
  tolerance: {
    minimumCoverage: 0.72,
    maxSteps: 9,
  },
});

export interface UseIncidentOrchestrationStudioResult {
  readonly workspace: IncidentStudioWorkspace | undefined;
  readonly runState: StudioActionState;
  readonly execute: (seed: WorkflowSeed) => Promise<void>;
  readonly clear: () => void;
  readonly diagnosticsText: string;
  readonly signalPhaseCounts: ReadonlyMap<string, number>;
  readonly signalEvents: readonly PluginBusEvent[];
  readonly signalStreaming: boolean;
  readonly signalLastEvent: PluginBusEvent | undefined;
}

const summarizeDiagnostics = (result: StudioExecutionResult | undefined) =>
  result?.diagnostics
    .flatMap((entry) => entry.diagnostics)
    .slice(-20)
    .join(' | ') ?? '';

const buildWorkspace = (result: StudioExecutionResult | undefined): IncidentStudioWorkspace | undefined => {
  if (!result) {
    return undefined;
  }

  const finalOutput = result.finalOutput;
  const output =
    finalOutput && 'policy' in finalOutput
      ? (finalOutput satisfies OrchestrationOutput)
      : undefined;
  const snapshot: WorkflowSnapshot | undefined =
    finalOutput && 'snapshot' in finalOutput
      ? (finalOutput as unknown as { readonly snapshot: WorkflowSnapshot }).snapshot
      : undefined;
  return {
    id: result.runId,
    tenantId: result.tenantId,
    incidentId: withBrand(result.runId as unknown as string, 'IncidentId'),
    operatorId: result.operatorId,
    discovered: undefined,
    assessed: undefined,
    snapshot,
    selectedPolicy: output?.policy?.id,
    policyApproved: output?.telemetry?.severity === 'low',
  };
};

export const useIncidentOrchestrationStudio = () => {
  const [result, setResult] = useState<StudioExecutionResult | undefined>(undefined);
  const [runState, setRunState] = useState<StudioActionState>({ status: 'idle' });

  const workflowSeed = {
    tenantId: 'tenant-omega',
    incidentId: 'incident-omega-1',
    operatorId: 'operator-omega',
  };

  const signalSeed = `${workflowSeed.tenantId}-${workflowSeed.incidentId}`;
  const signalStream = useIncidentSignalStream(signalSeed, runState.status === 'running');

  const execute = useCallback(async (seed: WorkflowSeed) => {
    setRunState({ status: 'running' });
    setResult(undefined);
    const input = defaultTemplate(seed);
    try {
      const output = await executeIncidentOrchestrationStudio(input);
      const finalOutput = output.finalOutput;
      const success = output.ok && finalOutput !== undefined;
      setResult(output);
      if (success) {
        setRunState({ status: 'complete', output: finalOutput as OrchestrationOutput });
      } else {
        setRunState({ status: 'failed', reason: output.error?.message ?? 'execution failed' });
      }
    } catch (error) {
      setRunState({
        status: 'failed',
        reason: error instanceof Error ? error.message : 'unknown failure',
      });
    }
  }, []);

  const clear = useCallback(() => {
    setResult(undefined);
    setRunState({ status: 'idle' });
  }, []);

  const workspace = useMemo(() => buildWorkspace(result), [result]);
  const diagnosticsText = useMemo(() => summarizeDiagnostics(result), [result]);

  return {
    workspace,
    runState,
    execute,
    clear,
    diagnosticsText,
    signalEvents: signalStream.events,
    signalStreaming: signalStream.isStreaming,
    signalLastEvent: signalStream.lastEvent,
    signalPhaseCounts: signalStream.summary,
  } satisfies UseIncidentOrchestrationStudioResult;
};
