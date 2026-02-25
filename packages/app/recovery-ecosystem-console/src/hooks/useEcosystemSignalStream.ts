import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalyticsStoreSignalEvent } from '@data/recovery-ecosystem-analytics-store';
import { createInMemorySignalAdapter } from '@service/recovery-ecosystem-analytics-orchestrator';
import {
  asSession,
  asNamespace,
  asTenant,
  asWindow,
} from '@domain/recovery-ecosystem-analytics';

type StreamState = 'idle' | 'opening' | 'open' | 'closing' | 'closed';

export interface UseSignalStreamConfig {
  readonly tenant: `tenant:${string}`;
  readonly namespace: `namespace:${string}`;
}

interface StreamHookState {
  readonly status: StreamState;
  readonly timeline: readonly string[];
  readonly events: readonly AnalyticsStoreSignalEvent[];
  readonly capacity: number;
  readonly activeSession: string | undefined;
}

interface StreamHookActions {
  readonly open: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly replay: () => Promise<void>;
  readonly appendMock: (kind: string) => Promise<void>;
}

const toWindow = (tenant: string, namespace: string): ReturnType<typeof asWindow> => asWindow(`window:${tenant}:${namespace}`);

export const useEcosystemSignalStream = (
  config: UseSignalStreamConfig,
): StreamHookState & StreamHookActions => {
  const [status, setStatus] = useState<StreamState>('idle');
  const [events, setEvents] = useState<readonly AnalyticsStoreSignalEvent[]>([]);
  const [timeline, setTimeline] = useState<readonly string[]>([]);
  const [activeSession, setActiveSession] = useState<string | undefined>(undefined);
  const repository = useRef<Awaited<ReturnType<typeof createInMemorySignalAdapter>> | undefined>(undefined);
  const runIdRef = useRef<`run:${string}`>('run:stream');
  const capacity = 64;

  const tenant = asTenant(config.tenant.replace(/^tenant:/, ''));
  const namespace = asNamespace(config.namespace.replace(/^namespace:/, ''));
  const defaultWindow = toWindow(tenant, namespace);

  const open = useCallback(async () => {
    if (repository.current?.store && status === 'open') return;
    setStatus('opening');
    const adapter = await createInMemorySignalAdapter();
    repository.current = adapter;
    const runId = `run:${tenant}-${Date.now()}` as `run:${string}`;
    runIdRef.current = runId;
    const session = asSession(`stream-${runId}`);
    await adapter.store.open({
      runId,
      tenant,
      namespace,
      window: defaultWindow,
      session,
    });
    const recorded = await adapter.store.read(runId);
    setEvents(recorded);
    setTimeline(recorded.map((entry) => `${entry.kind}@${entry.at}`));
    setActiveSession(String(session));
    setStatus('open');
  }, [tenant, namespace, defaultWindow, status]);

  const close = useCallback(async () => {
    if (!repository.current || status === 'closed') return;
    setStatus('closing');
    await repository.current.store.close(runIdRef.current);
    setStatus('closed');
    setEvents([]);
    setTimeline((previous) => [`closed:${runIdRef.current}`, ...previous]);
    setActiveSession(undefined);
  }, [status]);

  const replay = useCallback(async () => {
    if (!repository.current) return;
    const stream = await repository.current.store.read(runIdRef.current);
    setTimeline(stream.map((entry) => `${entry.kind}@${entry.at}`).toSorted());
    setEvents(stream);
  }, []);

  const appendMock = useCallback(async (kind: string) => {
    if (!repository.current) {
      setStatus('opening');
      await open();
      return;
    }
    await repository.current.store.append({
      id: `event:${Date.now()}` as `event:${number}`,
      kind: `signal:${kind}` as `signal:${string}`,
      runId: runIdRef.current,
      session: asSession(`mock:${tenant}`),
      tenant,
      namespace,
      window: asWindow(`window:${tenant}:${kind}`),
      payload: { kind, seed: true },
      at: new Date().toISOString(),
    });
    const items = await repository.current.store.read(runIdRef.current);
    setEvents(items.toSorted((left, right) => left.at.localeCompare(right.at)));
    setTimeline((previous) => [`append:${kind}`, ...previous].slice(0, capacity));
    setStatus('open');
  }, [open, tenant, namespace, capacity]);

  useEffect(() => {
    return () => {
      void close();
    };
  }, [close]);

  return {
    status,
    timeline,
    events,
    capacity,
    activeSession,
    open,
    close,
    replay,
    appendMock,
  };
};
