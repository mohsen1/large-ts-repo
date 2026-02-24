import { useCallback, useMemo, useState } from 'react';
import {
  runPlanSeries,
  type OrchestrationMode,
  type OrchestrationLane,
  type OrchestrationOutcome,
} from '@domain/recovery-lab-intelligence-core';

export interface SignalSample {
  readonly index: number;
  readonly label: string;
  readonly score: number;
  readonly eventCount: number;
  readonly route: string;
  readonly timestamp: string;
}

export interface SignalInput {
  readonly tenant: string;
  readonly scenario: string;
  readonly mode: OrchestrationMode;
  readonly lane: OrchestrationLane;
  readonly repeats?: number;
}

interface UseSignalsResult {
  readonly loading: boolean;
  readonly samples: readonly SignalSample[];
  readonly labels: readonly string[];
  readonly refresh: (input: SignalInput) => Promise<void>;
  readonly clear: () => void;
  readonly aggregate: { readonly peak: number; readonly totalEvents: number };
}

export const useIntelligenceSignals = (): UseSignalsResult => {
  const [samples, setSamples] = useState<readonly SignalSample[]>([]);
  const [labels, setLabels] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (input: SignalInput) => {
    setLoading(true);
    try {
      const repeats = input.repeats ?? 3;
      const outcomes = await runPlanSeries(
        {
          workspace: `workspace:${input.tenant}`,
          tenant: input.tenant,
          scenario: input.scenario,
          mode: input.mode,
          lane: input.lane,
          seed: {
            requestedAt: new Date().toISOString(),
            repeats,
            source: 'signal-hook',
          },
        },
        repeats,
      );

      const mapped = outcomes.map((outcome: OrchestrationOutcome, index) => ({
        index,
        label: `${input.mode}/${input.lane}/${index}`,
        score: outcome.result.score,
        eventCount: outcome.eventCount,
        route: outcome.registryRoute,
        timestamp: new Date().toISOString(),
      }));

      setSamples(mapped);
      setLabels(outcomes.map((entry) => `${entry.request.mode}:${entry.request.lane}:${entry.eventCount}`));
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setSamples([]);
    setLabels([]);
  }, []);

  const orderedLabels = useMemo(() => [...labels].toSorted((left, right) => right.localeCompare(left)), [labels]);
  const aggregate = useMemo(
    () => ({
      peak: Math.max(0, ...samples.map((sample) => sample.score)),
      totalEvents: samples.reduce((acc, sample) => acc + sample.eventCount, 0),
    }),
    [samples],
  );

  return {
    loading,
    samples,
    labels: orderedLabels,
    refresh,
    clear,
    aggregate,
  };
};
