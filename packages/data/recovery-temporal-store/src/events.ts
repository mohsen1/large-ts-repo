import { isoNow } from '@shared/temporal-ops-runtime';
import type { TemporalRunbook, OrchestrationSignal } from '@domain/recovery-temporal-orchestration';
import type { StoredRunbook } from './store';

export interface RunbookEventPayload {
  readonly runbook: TemporalRunbook;
  readonly previousStatus: StoredRunbook['status'] | undefined;
  readonly nextStatus: StoredRunbook['status'];
}

export interface StoreEvent<TPayload> {
  readonly eventId: string;
  readonly emittedAt: string;
  readonly payload: TPayload;
}

export interface EventEnvelope<TPayload> {
  readonly id: string;
  readonly kind: `temporal:event:${string}`;
  readonly data: TPayload;
  readonly metadata: {
    readonly at: string;
    readonly actor: string;
  };
}

export const asEventEnvelope = <TPayload>(
  kind: string,
  payload: TPayload,
  actor: string,
): EventEnvelope<TPayload> => ({
  id: `event:${Math.random().toString(36).slice(2)}`,
  kind: `temporal:event:${kind}` as const,
  data: payload,
  metadata: {
    at: isoNow(),
    actor,
  },
});

export const signalToRunbookEvent = (
  runbook: OrchestrationSignal<'domain', unknown>,
): EventEnvelope<OrchestrationSignal<'domain', unknown>> =>
  asEventEnvelope('signal', runbook, 'system');

export const runbookEvent = (
  runbook: TemporalRunbook,
  previousStatus: StoredRunbook['status'] | undefined,
  nextStatus: StoredRunbook['status'],
): EventEnvelope<RunbookEventPayload> =>
  asEventEnvelope('status',
    {
      runbook,
      previousStatus,
      nextStatus,
    },
    String(runbook.runId),
  );

export const normalizeSignal = <TPayload>(signal: OrchestrationSignal<'domain', TPayload>): StoreEvent<OrchestrationSignal<'domain', TPayload>> => ({
  eventId: `signal:${signal.signalId}`,
  emittedAt: signal.issuedAt,
  payload: signal,
});

export const signalStream = (
  signals: readonly OrchestrationSignal<'domain', unknown>[],
): readonly EventEnvelope<OrchestrationSignal<'domain', unknown>>[] =>
  signals
    .toSorted((left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt))
    .map((signal) => asEventEnvelope('signal', signal, signal.runId));

export const isRecent = <TPayload>(event: EventEnvelope<TPayload>, withinMs: number): boolean => {
  const age = Date.now() - Date.parse(event.metadata.at);
  return age <= withinMs;
};

export const dedupeEvents = <TPayload>(events: readonly EventEnvelope<TPayload>[]): readonly EventEnvelope<TPayload>[] => {
  const out = new Map<string, EventEnvelope<TPayload>>();
  for (const item of events) {
    if (!out.has(item.id)) {
      out.set(item.id, item);
    }
  }

  return [...out.values()].toSorted((left, right) => Date.parse(right.metadata.at) - Date.parse(left.metadata.at));
};
