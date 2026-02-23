import { InMemoryCockpitStore } from './memoryRepository';

export type CockpitBusEvent =
  | {
      readonly type: 'plan-upserted';
      readonly planId: string;
      readonly timestamp: string;
    }
  | {
      readonly type: 'run-state-changed';
      readonly planId: string;
      readonly runId: string;
      readonly state: string;
      readonly timestamp: string;
    }
  | {
      readonly type: 'event-published';
      readonly planId: string;
      readonly eventId: string;
      readonly status: string;
      readonly timestamp: string;
    }
  | {
      readonly type: 'slo-threshold-breach';
      readonly planId: string;
      readonly value: number;
      readonly threshold: number;
      readonly timestamp: string;
    };

export type CockpitBusSnapshot = {
  readonly counts: Readonly<Record<CockpitBusEvent['type'], number>>;
  readonly latest: readonly CockpitBusEvent[];
};

type Listener = (event: CockpitBusEvent) => void;

type BusState = {
  listeners: Map<CockpitBusEvent['type'], Set<Listener>>;
  history: CockpitBusEvent[];
};

export type CockpitEventBus = {
  subscribe(type: CockpitBusEvent['type'], listener: Listener): () => void;
  publish(event: CockpitBusEvent): void;
  hydrateSnapshot(): CockpitBusSnapshot;
};

const initial: CockpitBusSnapshot = {
  counts: {
    'plan-upserted': 0,
    'run-state-changed': 0,
    'event-published': 0,
    'slo-threshold-breach': 0,
  },
  latest: [],
};

const clampHistory = (history: readonly CockpitBusEvent[]): CockpitBusEvent[] => {
  if (history.length <= 150) return [...history];
  return history.slice(history.length - 150);
};

const record = (state: BusState, event: CockpitBusEvent): void => {
  const current = state.history;
  const updated = [...current, event];
  state.history = clampHistory(updated);
};

const recalc = (state: BusState): CockpitBusSnapshot => {
  const counts: Record<CockpitBusEvent['type'], number> = {
    'plan-upserted': 0,
    'run-state-changed': 0,
    'event-published': 0,
    'slo-threshold-breach': 0,
  };

  for (const event of state.history) {
    counts[event.type] += 1;
  }

  return {
    counts,
    latest: [...state.history],
  };
};

export const createCockpitEventBus = (): CockpitEventBus => {
  const state: BusState = {
    listeners: new Map(),
    history: [],
  };

  const subscribe = (type: CockpitBusEvent['type'], listener: Listener): (() => void) => {
    const current = state.listeners.get(type) ?? new Set();
    current.add(listener);
    state.listeners.set(type, current);
    return () => {
      current.delete(listener);
      if (current.size === 0) {
        state.listeners.delete(type);
      }
    };
  };

  const publish = (event: CockpitBusEvent): void => {
    record(state, event);
    const listeners = state.listeners.get(event.type);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(event);
    }
  };

  return {
    subscribe,
    publish,
    hydrateSnapshot: () => recalc(state),
  };
};

export type StoreWithBus = InMemoryCockpitStore & {
  bus: CockpitEventBus;
};

export const instrumentStoreWithBus = (store: InMemoryCockpitStore, bus: CockpitEventBus): StoreWithBus => {
  return Object.assign(store, { bus }) as StoreWithBus;
};
