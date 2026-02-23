import { useEffect, useMemo, useState } from 'react';
import type { RecoverySignal } from '@domain/recovery-scenario-orchestration';

interface StreamOptions {
  readonly tenantId: string;
  readonly scenarioId: string;
}

export interface StreamPoint {
  readonly pointAt: string;
  readonly metric: string;
  readonly value: number;
}

export const useScenarioDataStream = ({ tenantId, scenarioId }: StreamOptions) => {
  const [samples, setSamples] = useState<readonly RecoverySignal[]>([]);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!polling) {
      return;
    }

    const timer = setInterval(() => {
      const value = Math.round(Math.random() * 100);
      const now = new Date().toISOString();
      const metric = Math.random() < 0.5 ? 'latency' : 'error-rate';
      const next: RecoverySignal = {
        id: `${tenantId}:${scenarioId}:${Date.now()}` as any,
        tenantId: tenantId as any,
        incidentId: `${tenantId}:incident` as any,
        metric,
        value,
        unit: metric === 'latency' ? 'ms' : 'ratio',
        observedAt: now,
        dimensions: {
          source: 'ingestion',
          scenarioId,
        },
      };

      setSamples((previous) => {
        const updated = [next, ...previous].slice(0, 60);
        return updated;
      });
    }, 1200);

    return () => clearInterval(timer);
  }, [tenantId, scenarioId, polling]);

  const latestByMetric = useMemo(() => {
    const grouped = new Map<string, StreamPoint[]>();
    for (const sample of samples) {
      const bucket = grouped.get(sample.metric) ?? [];
      bucket.push({
        pointAt: sample.observedAt,
        metric: sample.metric,
        value: sample.value,
      });
      grouped.set(sample.metric, bucket);
    }

    return [...grouped.entries()].map(([metric, points]) => ({ metric, points: [...points].reverse() }));
  }, [samples]);

  return {
    samples,
    latestByMetric,
    isPolling: polling,
    pause: () => setPolling(false),
    resume: () => setPolling(true),
  };
};
