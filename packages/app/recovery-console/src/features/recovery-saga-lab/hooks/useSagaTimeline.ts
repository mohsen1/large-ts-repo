import { useEffect, useMemo, useState } from 'react';
import { createOrchestrator, type SagaRuntimeConfig, type SagaRuntimeSnapshot } from '@service/recovery-incident-saga-orchestrator';
import type { ScenarioBundle } from '@domain/recovery-incident-saga';
import { viewToRuntimeEvents } from '../services/sagaAdapters';
import { toOutcomeBundle } from '../services/sagaAdapters';

export const useSagaTimeline = (bundle: ScenarioBundle): {
  readonly timeline: readonly string[];
  events: SagaRuntimeSnapshot['events'];
  readonly reload: () => Promise<void>;
  readonly stop: () => Promise<void>;
} => {
  const [snapshot, setSnapshot] = useState<SagaRuntimeSnapshot>({
    runId: bundle.run.id,
    state: 'idle',
    events: [],
  });
  const [label, setLabel] = useState<string>('');

  const orchestrator = useMemo(
    () =>
      createOrchestrator({
        runtimeId: `ui-${bundle.run.id}`,
        namespace: bundle.run.domain,
      }),
    [bundle.run.id, bundle.run.domain],
  );

  const reload = async (): Promise<void> => {
    const success = await orchestrator.run(bundle);
    if (success) {
      setSnapshot((current) => ({
        ...current,
        state: 'done',
        events: [...current.events, ...viewToRuntimeEvents(toOutcomeBundle(bundle.run, bundle.plan, bundle.policy))],
      }));
      setLabel('completed');
      return;
    }
    setSnapshot((current) => ({ ...current, state: 'failed' }));
    setLabel('failed');
  };

  const stop = async (): Promise<void> => {
    await orchestrator.stop();
    setSnapshot((current) => ({ ...current, state: 'failed' }));
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setLabel((current) => (current === 'completed' ? 'completed' : current));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return {
    timeline: snapshot.events.map((event) => `${event.kind}:${event.eventId}`),
    events: snapshot.events,
    reload,
    stop,
  };
};
