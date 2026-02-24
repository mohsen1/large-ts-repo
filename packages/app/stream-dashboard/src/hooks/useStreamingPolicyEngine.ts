import { useCallback, useMemo, useState } from 'react';
import { StreamEventRecord } from '@domain/streaming-observability';
import { ControlMode } from '@service/streaming-control';
import { runGovernanceOrchestration, runPolicyOnlyOrchestration } from '../services/streamPluginService';
import { StreamDashboardContext, StreamIngestEvent } from '../services/streamDashboardService';

interface PolicyEngineState {
  readonly streamId: string;
  readonly loading: boolean;
  readonly error: string | null;
  readonly policyScale: number;
  readonly policyWarnings: readonly string[];
  readonly policyActions: readonly string[];
  readonly policiesRun: number;
}

export const useStreamingPolicyEngine = (
  context: StreamDashboardContext,
  streamId: string,
) => {
  const [state, setState] = useState<PolicyEngineState>({
    streamId,
    loading: false,
    error: null,
    policyScale: 1,
    policyWarnings: [],
    policyActions: [],
    policiesRun: 0,
  });

  const runPolicy = useCallback(async (
    events: StreamEventRecord[],
    mode: ControlMode,
  ) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const request: StreamIngestEvent = { streamId, events };
      const result = await runGovernanceOrchestration(context, request, mode);
      const next = {
        ...state,
        loading: false,
        policyScale: result.planScale,
        policyWarnings: result.snapshot.policyScale > 1 ? [`scale ${result.snapshot.policyScale}`] : [],
        policyActions: result.snapshot.commands.map((command) => command.command),
        policiesRun: state.policiesRun + 1,
      };
      setState(next);
      return result;
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      return null;
    }
  }, [context.tenant, streamId, state]);

  const runReadOnly = useCallback(async () => {
    const baseline = await runPolicyOnlyOrchestration(context.tenant, streamId, []);
    setState((current) => ({
      ...current,
      policyScale: baseline.policyScale,
      policyWarnings: baseline.warnings,
      policyActions: baseline.commandActions.map((command) => command.command),
    }));
  }, [context.tenant, streamId]);

  const metrics = useMemo(() => ({
    isCritical: state.policyScale > 5,
    actionDensity: state.policyActions.length,
    warningCount: state.policyWarnings.length,
  }), [state.policyActions.length, state.policyScale, state.policyWarnings.length]);

  return { state, runPolicy, runReadOnly, metrics };
};
