import { useEffect, useMemo, useState } from 'react';
import { createAsyncScope } from '../services/scope';
import { RecoveryStudioEventBus, type StudioEvent } from '../services/eventBus';
import type { PluginBusEvent } from './useIncidentOrchestrationStudio';

const makeEvent = (seed: string, counter: number): PluginBusEvent => ({
  kind: 'progress',
  pluginId: `seed-${seed}-${counter}`,
  pluginName: 'signal-stream',
  phase: 'observe',
  diagnostics: [`seed:${seed}`, `counter:${counter}`],
});

const createSignalSequence = async function* (seed: string, signal: AbortSignal): AsyncGenerator<PluginBusEvent, void, undefined> {
  for (let index = 0; index < 16; index += 1) {
    if (signal.aborted) {
      return;
    }
    const waitMs = ((index * 79) % 140) + 90;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    yield makeEvent(seed, index);
  }
}

export interface IncidentSignalStreamState {
  readonly events: readonly PluginBusEvent[];
  readonly isStreaming: boolean;
  readonly lastEvent?: PluginBusEvent;
}

export const useIncidentSignalStream = (seed: string, active: boolean) => {
  const [events, setEvents] = useState<readonly PluginBusEvent[]>([]);
  const [isStreaming, setStreaming] = useState(false);

  const summary = useMemo(
    () =>
      events.reduce(
        (acc, event) => {
          const previous = acc.get(event.phase) ?? 0;
          acc.set(event.phase, previous + 1);
          return acc;
        },
        new Map<string, number>(),
      ),
    [events],
  );

  const lastEvent = events[events.length - 1];

  useEffect(() => {
    if (!active) {
      setEvents([]);
      setStreaming(false);
      return;
    }

    const controller = new AbortController();
    const bus = new RecoveryStudioEventBus<PluginBusEvent>();
    const asyncScope = createAsyncScope();
    setStreaming(true);

    asyncScope.defer(() => {
      controller.abort();
      bus.close();
    });

    const run = async () => {
      await using _scope = asyncScope;
      for await (const event of bus) {
        setEvents((current) => [event.payload, ...current.slice(0, 80)]);
      }
    };
    void run();

    (async () => {
      for await (const event of createSignalSequence(seed, controller.signal)) {
        bus.publish({
          id: `${seed}-${event.phase}-${event.pluginId}`,
          kind: 'progress',
          pluginId: event.pluginId,
          pluginName: event.pluginName,
          payload: event,
          at: new Date().toISOString(),
        });
      }
      setStreaming(false);
    })();

    return () => {
      void asyncScope[Symbol.asyncDispose]();
    };
  }, [seed, active]);

  return { events, isStreaming, lastEvent, summary };
};
