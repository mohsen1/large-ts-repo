import { tupleJoin, zip } from './tuple-utils';

export type EventSeverity = 'critical' | 'high' | 'medium' | 'low';
export type EventChannel = `channel:${string}`;
export type EventKind = `kind:${string}`;

export type EventEnvelope<
  TPayload,
  TChannel extends string = string,
  TKind extends string = string,
> = {
  readonly id: string;
  readonly channel: EventChannel;
  readonly kind: EventKind;
  readonly event: `${TChannel}/${TKind}`;
  readonly severity: EventSeverity;
  readonly timestamp: string;
  readonly payload: TPayload;
};

export type EventCatalog<TChannel extends string, TKind extends string> = {
  [K in `${TChannel}/${TKind}`]: EventEnvelope<unknown, TChannel, TKind>;
};

export type EventNames<TCatalog extends Record<string, EventEnvelope<unknown>>> = keyof TCatalog & string;

export type ExtractPayload<
  T extends Record<string, EventEnvelope<unknown>>,
  TEvent extends EventNames<T>,
> = T[TEvent]['payload'];

export type RoutedEvent<
  TEventName extends string,
  TPayload,
  TChannel extends string,
  TKind extends string,
> = EventEnvelope<TPayload, TChannel, TKind> & {
  readonly event: TEventName;
};

export type EventRouterOptions = {
  readonly includeChannels: readonly string[];
  readonly includeKinds: readonly string[];
  readonly includeSeverities: readonly EventSeverity[];
};

export class EventBus<
  TEventMap extends Record<string, EventEnvelope<unknown>> = Record<string, EventEnvelope<unknown>>,
> {
  #listeners = new Map<keyof TEventMap, Array<(payload: TEventMap[keyof TEventMap]) => void>>();
  #history: TEventMap[keyof TEventMap][] = [];

  public publish<TEvent extends EventNames<TEventMap>>(
    event: TEvent,
    payload: TEventMap[TEvent],
  ): void {
    this.#history.push(payload);
    for (const listener of this.#listeners.get(event) ?? []) {
      listener(payload as TEventMap[keyof TEventMap]);
    }
  }

  public subscribe<TEvent extends EventNames<TEventMap>>(
    event: TEvent,
    listener: (payload: TEventMap[TEvent]) => void,
  ): { unsubscribe: () => void } {
    const topic = event as keyof TEventMap;
    const listeners = this.#listeners.get(topic) ?? [];
    listeners.push(listener as (payload: TEventMap[keyof TEventMap]) => void);
    this.#listeners.set(topic, listeners);
    return {
      unsubscribe: () => {
        this.#listeners.set(
          topic,
          listeners.filter((value) => value !== listener),
        );
      },
    };
  }

  public *stream(): Iterable<TEventMap[keyof TEventMap]> {
    const snapshot = [...this.#history];
    for (const event of snapshot) {
      yield event;
    }
  }
}

const byChannel = <T extends EventEnvelope<unknown>>(events: readonly T[], channel: string): T[] =>
  events.filter((entry) => entry.channel === `channel:${channel}`);

export const groupEventNames = <
  T extends readonly EventEnvelope<unknown>[],
>(events: T, options: EventRouterOptions): readonly EventSeverity[] => {
  const bySeverity = byChannel(events, options.includeChannels[0] ?? 'all');
  const zipped = zip(bySeverity.map((entry) => entry.event), bySeverity.map((entry) => entry.severity));
  const joined = tupleJoin(
    [...new Set(zipped.map((entry) => entry[1]))],
    ',',
  );
  const parsed = joined.length === 0 ? 'info' : joined;
  return parsed
    .split(',')
    .map((item) => (item as EventSeverity))
    .filter((item): item is EventSeverity =>
      (['critical', 'high', 'medium', 'low'] as const).includes(item),
    );
};

