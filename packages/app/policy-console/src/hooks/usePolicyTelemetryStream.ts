import { useEffect, useMemo, useState } from 'react';
import { collectRunTelemetry } from '@service/policy-orchestration-engine';
import { InMemoryPolicyStore } from '@data/policy-orchestration-store';

export interface PolicyTelemetryPoint {
  runId: string;
  generatedAt: string;
  labels: Readonly<Record<string, string>>;
}

interface Options {
  orchestratorId: string;
  store?: InMemoryPolicyStore;
  intervalMs?: number;
  keep?: number;
}

export function usePolicyTelemetryStream({
  orchestratorId,
  store = new InMemoryPolicyStore(),
  intervalMs = 1_000,
  keep = 20,
}: Options) {
  const [points, setPoints] = useState<readonly PolicyTelemetryPoint[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  const latest = points.at(-1);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const emit = async () => {
      try {
        const envelope = await collectRunTelemetry(store, orchestratorId);
        const next = Object.fromEntries(
          envelope.metrics.map((metric) => [`${metric.name}:${metric.unit}`, String(metric.value)]),
        );
        if (!active) return;
        setPoints((current) => {
          const head = [...current];
          head.push({
            runId: envelope.runId,
            generatedAt: envelope.generatedAt,
            labels: next,
          });
          return head.slice(-keep);
        });
      } catch {
        if (active) {
          setPoints((current) => {
            const fallback = [...current];
            fallback.push({
              runId: `error:${Date.now()}`,
              generatedAt: new Date().toISOString(),
              labels: { error: 'telemetry failed' },
            });
            return fallback.slice(-keep);
          });
        }
      }
    };

    const iteratorFrom = (globalThis as { Iterator?: { from?: (value: Iterable<unknown>) => { toArray: () => unknown[] } } }).Iterator?.from;
    const sources = iteratorFrom?.(Array.from({ length: 1 }, () => orchestratorId))?.toArray();
    if (sources?.length === 1) {
      setIsStreaming(true);
    }

    void emit();
    timer = setInterval(() => {
      void emit();
    }, intervalMs);
    return () => {
      active = false;
      setIsStreaming(false);
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [orchestratorId, keep, intervalMs, store]);

  const summary = useMemo(
    () => ({
      count: points.length,
      isStreaming,
      latestRunId: latest?.runId ?? null,
    }),
    [isStreaming, points.length, latest?.runId],
  );

  return {
    points,
    summary,
    isStreaming,
  };
}

