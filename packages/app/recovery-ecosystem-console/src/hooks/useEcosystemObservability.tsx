import { useCallback, useEffect, useMemo, useState } from 'react';
import { createObservabilityService } from '@service/recovery-ecosystem-orchestrator';
import type { NamespaceTag, RunId, TenantId } from '@domain/recovery-ecosystem-core';
import { createServiceRuntime } from '@service/recovery-ecosystem-orchestrator';
import { useMemo as useMemoStrict } from 'react';

const runtime = createServiceRuntime({ timeoutMs: 20, retryLimit: 2, namespace: 'observability-console' });

export interface ObservabilitySnapshot {
  readonly runId: string;
  readonly timeline: readonly {
    readonly at: string;
    readonly event: string;
    readonly stage: string;
    readonly phase: string;
  }[];
  readonly fingerprints: readonly string[];
  readonly count: number;
  readonly namespace: NamespaceTag;
}

export interface UseObservabilityState {
  readonly loading: boolean;
  readonly namespace: NamespaceTag;
  readonly snapshots: readonly ObservabilitySnapshot[];
  readonly errors: readonly string[];
  readonly selectedRunId?: string;
  readonly selectedSnapshot?: ObservabilitySnapshot;
}

export interface UseObservabilityActions {
  readonly refresh: () => Promise<void>;
  readonly inspectRun: (runId: string) => Promise<void>;
  readonly clearErrors: () => void;
}

type TelemetryPayload = {
  readonly stage: string;
  readonly phase: string;
};

type TelemetryFrame = {
  readonly runId: RunId;
  readonly namespace: NamespaceTag;
  readonly fingerprint: string;
  readonly event: {
    readonly at: string;
    readonly event: `event:${string}`;
    readonly payload: Partial<TelemetryPayload>;
    readonly namespace: NamespaceTag;
    readonly tenant: TenantId;
    readonly runId: RunId;
  };
};

const service = createObservabilityService();

const digestFrames = (frames: readonly { readonly fingerprint: string }[]): readonly string[] =>
  frames.map((entry) => entry.fingerprint).toSorted();

const normalizeEvents = (frames: Iterable<TelemetryFrame>): ObservabilitySnapshot[] => {
  const byRun = new Map<string, { namespace: NamespaceTag; events: Array<TelemetryFrame> }>();

  for (const frame of frames) {
    const entry = byRun.get(frame.runId);
    const value = frame;

    if (!entry) {
      byRun.set(frame.runId, {
        namespace: frame.namespace,
        events: [value],
      });
      continue;
    }

    entry.events.push(value);
  }

  return [...byRun.entries()].map(([runId, value]) => {
    const ordered = value.events.toSorted((left, right) =>
      String(left.event.at).localeCompare(String(right.event.at)),
    );
    const timeline = ordered.map((entry) => ({
      at: String(entry.event.at),
      event: String(entry.event.event),
      stage: String(entry.event.payload?.stage ?? entry.event.payload?.['stage'] ?? 'unknown'),
      phase: String(entry.event.payload?.phase ?? entry.event.payload?.['phase'] ?? 'unknown'),
    }));
    return {
      runId,
      namespace: value.namespace,
      timeline,
      fingerprints: digestFrames(ordered),
      count: ordered.length,
    };
  });
};

export const useEcosystemObservability = (namespace: NamespaceTag): UseObservabilityState & UseObservabilityActions => {
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<readonly ObservabilitySnapshot[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<readonly string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const iterable = await service.collect(runStore(), namespace, 128);
      const frames: Array<TelemetryFrame> = [];
      for await (const frame of iterable) {
        frames.push({
          runId: frame.runId,
          namespace: frame.namespace,
          fingerprint: String(frame.fingerprint),
          event: {
            at: frame.event.at,
            event: frame.event.event,
            payload: frame.event.payload as Partial<TelemetryPayload>,
            namespace: frame.event.namespace,
            tenant: frame.event.tenant,
            runId: frame.event.runId,
          },
        });
      }

      setSnapshots(normalizeEvents(frames));
    } catch (error) {
      setErrors((previous) => [...previous, String(error)]);
    } finally {
      setLoading(false);
    }
  }, [namespace]);

  const inspectRun = useCallback(async (runId: string) => {
    try {
      setSelectedRunId(runId);
      const inspected = await service.inspect(runtime.dependencies.store, namespace, asRun(runId));
      if (!inspected.ok) {
        setErrors((previous) => [...previous, inspected.error.message]);
        return;
      }
      setSnapshots((previous) =>
        previous.map((snapshot) =>
          snapshot.runId === runId
            ? {
                ...snapshot,
                count: snapshot.count + inspected.value.values.length,
                fingerprints: [...snapshot.fingerprints, ...inspected.value.values.map((value) => String(value.at))],
              }
            : snapshot,
        ),
      );
    } catch (error) {
      setErrors((previous) => [...previous, String(error)]);
    }
  }, [namespace]);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedSnapshot = useMemo(() => snapshots.find((snapshot) => snapshot.runId === selectedRunId), [selectedRunId, snapshots]);
  useMemoStrict(() => snapshots, [snapshots]);

  return {
    loading,
    namespace,
    snapshots,
    errors,
    selectedRunId,
    selectedSnapshot,
    refresh,
    inspectRun,
    clearErrors,
  };
};

const asRun = (runId: string): RunId => `run:${runId}` as RunId;
const runStore = () => runtime.dependencies.store;
