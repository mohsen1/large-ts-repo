import { useCallback, useMemo, useState } from 'react';
import { StreamHealthSignal, StreamEventRecord, StreamSlaWindow } from '@domain/streaming-observability';
import { runDashboardOrchestration, runMultipleStreams } from '../services/streamDashboardService';
import { mapPlanToRenderModel, DashboardRenderModel } from '../services/streamingAdapterService';

export interface StreamDashboardState {
  streamId: string;
  tenant: string;
  loading: boolean;
  error: string | null;
  snapshot: {
    plan: DashboardRenderModel | null;
    signals: StreamHealthSignal[];
    history: StreamSlaWindow[];
  };
}

const emptyState = (tenant: string, streamId: string): StreamDashboardState => ({
  tenant,
  streamId,
  loading: false,
  error: null,
  snapshot: { plan: null, signals: [], history: [] },
});

export const useStreamDashboard = (tenant: string, streamId: string) => {
  const [state, setState] = useState<StreamDashboardState>(emptyState(tenant, streamId));

  const ingest = useCallback(async (events: StreamEventRecord[]) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const snapshot = await runDashboardOrchestration({ tenant, streamId }, { streamId, events });
      setState((current) => ({
        ...current,
        loading: false,
        snapshot: {
          plan: mapPlanToRenderModel(snapshot.plan),
          signals: snapshot.signals,
          history: snapshot.history,
        },
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: String(error instanceof Error ? error.message : error) }));
    }
  }, [streamId, tenant]);

  const summarizeAll = useCallback(async (payloads: Array<{ streamId: string; events: StreamEventRecord[] }>) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const summary = await runMultipleStreams(tenant, payloads);
      if (!summary) {
        setState((current) => ({ ...current, loading: false }));
        return null;
      }
      return summary;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: String(error instanceof Error ? error.message : error) }));
      return null;
    }
  }, [tenant]);

  const metricSummary = useMemo(() => {
    const critical = state.snapshot.signals.filter((signal) => signal.level === 'critical').length;
    const warning = state.snapshot.signals.filter((signal) => signal.level === 'warning').length;
    return {
      criticalCount: critical,
      warningCount: warning,
      okCount: state.snapshot.signals.length - critical - warning,
      latestPlanState: state.snapshot.plan?.health ?? 'unknown',
    };
  }, [state.snapshot.signals, state.snapshot.plan]);

  return { state, ingest, summarizeAll, metricSummary };
};
