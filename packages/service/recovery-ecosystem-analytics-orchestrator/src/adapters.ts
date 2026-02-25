import { createRepository } from '@data/recovery-ecosystem-analytics-store';
import type { AnalyticsStoreSignalEvent, AnalyticsStore } from '@data/recovery-ecosystem-analytics-store';
import type { JsonValue } from '@shared/type-level';
import {
  asNamespace,
  asRun,
  asSession,
  asSignal,
  asTenant,
  asWindow,
} from '@domain/recovery-ecosystem-analytics';
import type { SignalEmitter } from './ports';

interface DisposableScope extends AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
}

export interface InMemoryAnalyticsAdapter {
  readonly store: AnalyticsStore;
  readonly emitter: SignalEmitter;
  readonly scope: DisposableScope;
}

const resolveEventId = (_runId: `run:${string}`): `event:${number}` =>
  `event:${Math.floor(Math.random() * 10000)}` as `event:${number}`;

const resolveSession = (runId: string): string => `session:${runId}`;
const resolveTenant = (runId: string): string => `tenant:${runId.split(':')[1] ?? 'fallback'}`;

const encodePayload = (payload: unknown): JsonValue => {
  if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean' || payload === null) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(encodePayload);
  }
  if (typeof payload === 'object') {
    return Object.entries(payload as Record<string, unknown>).reduce<Record<string, JsonValue>>(
      (acc, [key, value]) => {
        acc[key] = encodePayload(value) as JsonValue;
        return acc;
      },
      {},
    );
  }
  return String(payload) as JsonValue;
};

export const createInMemorySignalAdapter = async (): Promise<InMemoryAnalyticsAdapter> => {
  const store = createRepository();
  const scope: DisposableScope = {
    [Symbol.asyncDispose]: async () => {
      await store[Symbol.asyncDispose]();
    },
  };

  const emitter: SignalEmitter = {
    async emit(event, runId) {
      const baseline = createEventBase(runId);
      const signalEvent: AnalyticsStoreSignalEvent = {
        id: resolveEventId(runId),
        kind: asSignal(event.kind.replace('signal:', '')),
        runId,
        session: asSession(resolveSession(runId)),
        tenant: asTenant(resolveTenant(runId)),
        namespace: asNamespace('namespace:recovery-ecosystem'),
        window: baseline.window,
        payload: encodePayload(event.payload),
        at: baseline.at,
      };
      await store.append(signalEvent);
      return signalEvent;
    },
  };

  await store.open({
    runId: asRun('adapter-bootstrap'),
    tenant: asTenant('tenant:analytics-bootstrap'),
    namespace: asNamespace('namespace:recovery-ecosystem'),
    window: asWindow('window:analytics-bootstrap'),
    session: asSession('analytics-bootstrap'),
  });

  return { store, emitter, scope };
};

const createEventBase = (runId: string): { readonly window: ReturnType<typeof asWindow>; readonly at: string } => ({
  window: asWindow(`window:${runId}`),
  at: new Date().toISOString(),
});
