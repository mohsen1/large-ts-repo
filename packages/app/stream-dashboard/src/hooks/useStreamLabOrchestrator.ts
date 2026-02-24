import { useCallback, useEffect, useMemo, useState } from 'react';
import { NoInfer } from '@shared/type-level';
import { buildAnalytics } from '../stress-lab/analytics';
import { buildDefaultStreamLabRequest, runStreamLabSession } from '../stress-lab/orchestrator';
import {
  type StreamLabExecutionReport,
  type StreamLabExecutionResult,
  type StreamLabRequest,
} from '../stress-lab/types';

interface UseStreamLabOrchestratorState {
  readonly loading: boolean;
  readonly error: string | null;
  readonly request: StreamLabRequest;
  readonly report: StreamLabExecutionReport | null;
  readonly analytics: ReturnType<typeof buildAnalytics> | null;
  readonly traces: readonly string[];
}

const emptyReport = (request: StreamLabRequest): StreamLabExecutionReport => ({
  request: {
    request,
    runId: `${request.tenantId}-${request.streamId}-${Date.now()}` as StreamLabExecutionResult['runId'],
    startedAt: new Date().toISOString(),
  },
  result: {
    tenantId: request.tenantId,
    runId: `${request.tenantId}-${request.streamId}` as StreamLabExecutionResult['runId'],
    finalSignals: [],
    topology: {
      tenantId: request.tenantId,
      nodes: [],
      edges: [],
    },
    trace: [],
    recommendations: [],
  },
  chainOutput: {
    tenantId: request.tenantId,
    streamId: request.streamId,
    targetConfig: {
      tenant: request.tenantId,
      streamId: request.streamId,
      targetRunbooks: [],
      pluginNames: [],
    },
    recommendations: [],
    window: {
      windowId: `${request.streamId}-${request.tenantId}`,
      window: { start: Date.now(), end: Date.now() },
      targetMs: 120,
      actualMs: 120,
      violated: false,
    },
    contextSummary: {
      activePlugins: [],
      profile: 'adaptive',
    },
  },
  metrics: {
    runId: `${request.streamId}-${request.tenantId}` as StreamLabExecutionResult['runId'],
    tenantId: request.tenantId,
    streamId: request.streamId,
    rankedSignals: [],
    topologyDigest: '',
    metrics: { score: 0, riskLevel: 'low', alertCount: 0 },
  },
  recommendationCount: 0,
  traces: [],
});

export const useStreamLabOrchestrator = <TRequest extends StreamLabRequest>(
  requestOverride?: NoInfer<TRequest>,
) => {
  const defaultRequest = useMemo(
    () => requestOverride ?? (buildDefaultStreamLabRequest('tenant-main', 'stream-core') as TRequest),
    [requestOverride],
  );
  const [state, setState] = useState<UseStreamLabOrchestratorState>({
    loading: false,
    error: null,
    request: defaultRequest,
    report: null,
    analytics: null,
    traces: [],
  });

  useEffect(() => {
    setState((current) => ({
      ...current,
      request: defaultRequest,
      report: null,
      analytics: null,
      traces: [],
      error: null,
    }));
  }, [defaultRequest]);

  const execute = useCallback(async (request?: NoInfer<TRequest>) => {
    const runRequest = request ?? defaultRequest;
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const report = await runStreamLabSession(runRequest);
      const analytics = buildAnalytics(runRequest, report.result, report.metrics);
      setState((current) => ({
        ...current,
        loading: false,
        report,
        analytics,
        traces: report.traces.map((trace) => `${trace.pluginName}@${trace.status}`),
      }));
      return report;
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      return emptyReport(runRequest);
    }
  }, [defaultRequest]);

  const reset = useCallback(() => {
    setState((current) => ({
      ...current,
      request: defaultRequest,
      report: null,
      analytics: null,
      traces: [],
      error: null,
      loading: false,
    }));
  }, [defaultRequest]);

  return {
    loading: state.loading,
    error: state.error,
    request: state.request,
    report: state.report,
    analytics: state.analytics,
    traces: state.traces,
    execute,
    reset,
  };
};
