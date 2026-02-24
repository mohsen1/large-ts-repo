import { useCallback, useEffect, useMemo, useState } from 'react';
import { type AnySignalEnvelope, type SignalLayer, type SignalRunId } from '@domain/recovery-cockpit-cognitive-core';
import {
  type OrchestratorInput,
  type OrchestratorSubmission,
  summarizeForDashboard,
  runCognitiveWorkflow,
  collectSignals,
  summarizeWorkspace,
  ingestSignals,
} from '@service/recovery-cockpit-cognitive-orchestrator';

type SignalBuckets = { [K in SignalLayer]: number };

type TimelineEvent = {
  readonly at: string;
  readonly message: string;
};

export type CognitiveSignalsState = {
  readonly signals: readonly AnySignalEnvelope[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly layers: SignalBuckets;
  readonly timeline: readonly TimelineEvent[];
  readonly runId: SignalRunId | null;
};

const emptyBuckets = (): SignalBuckets => ({
  readiness: 0,
  continuity: 0,
  drift: 0,
  policy: 0,
  anomaly: 0,
  capacity: 0,
});

export const useCognitiveCockpitSignals = (
  input: OrchestratorInput,
): CognitiveSignalsState & {
  readonly refresh: () => Promise<void>;
  readonly run: () => Promise<void>;
  readonly inject: (signals: readonly AnySignalEnvelope[]) => Promise<void>;
} => {
  const [signals, setSignals] = useState<readonly AnySignalEnvelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<SignalRunId | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const next = await collectSignals(input);
      const summary = await summarizeWorkspace(input);
      setSignals(next);
      setRunId(next.at(0)?.runId ?? null);
      setError(null);
      void summary;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh cognitive signals');
    } finally {
      setLoading(false);
    }
  }, [input]);

  const run = useCallback(async () => {
    try {
      setLoading(true);
      const output = await runCognitiveWorkflow(input);
      await refresh();
      setRunId(output.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run cognitive workflow');
    } finally {
      setLoading(false);
    }
  }, [input, refresh]);

  const inject = useCallback(
    async (nextSignals: readonly AnySignalEnvelope[]) => {
      try {
        await ingestSignals({
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          signals: nextSignals,
        } satisfies OrchestratorSubmission);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to ingest signals');
      }
    },
    [input, refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const layers = useMemo(() => {
    const buckets = emptyBuckets();
    for (const signal of signals) {
      const layer = signal.layer as SignalLayer;
      buckets[layer] += 1;
    }
    return buckets;
  }, [signals]);

  const timeline = useMemo(
    () => summarizeForDashboard(signals).map((entry) => ({
      at: new Date(entry.runId).toISOString(),
      message: `${entry.pluginId} ${entry.stage}`,
    })),
    [signals],
  );

  return {
    loading,
    error,
    signals,
    layers,
    timeline,
    runId,
    refresh,
    run,
    inject,
  };
};
