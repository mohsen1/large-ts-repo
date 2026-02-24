import { useMemo } from 'react';
import { useReadinessLabFacade } from '../hooks/useReadinessLabFacade';
import { ReadinessLabHeatmap } from './ReadinessLabHeatmap';
import { ReadinessLabControls } from './ReadinessLabControls';
import { ReadinessLabSummary } from './ReadinessLabSummary';
import type { ReadinessLabHeatmapCell } from '../types';
import type { ReadinessSignal } from '@domain/recovery-readiness';

interface ReadinessLabRunnerProps {
  readonly tenant: string;
  readonly namespace: string;
}

export const ReadinessLabRunner = ({ tenant, namespace }: ReadinessLabRunnerProps) => {
  const facade = useReadinessLabFacade({ tenant, namespace });

  const heatmap: ReadinessLabHeatmapCell[] = useMemo(
    () =>
      facade.state.events.flatMap((event) =>
        event.generatedSignals.map((signal: ReadinessSignal) => ({
          coordinate: `${namespace}/${signal.signalId}`,
          count: Math.max(1, signal.details?.['count'] as number | undefined ?? 1),
          score: facade.state.pluginStates.length,
        })),
      ),
    [facade.state.events, namespace],
  );

  return (
    <article>
      <ReadinessLabControls
        tenant={tenant}
        namespace={namespace}
        pluginStates={facade.state.pluginStates}
        onTenantChange={() => undefined}
        onNamespaceChange={() => undefined}
        onRun={facade.run}
      />
      <ReadinessLabHeatmap cells={heatmap} namespace={namespace} />
      <ReadinessLabSummary state={facade.state} isRunning={facade.isRunning} pluginCount={facade.pluginCount} />
      <section>
        <h3>Event Bus</h3>
        <p>{facade.eventBus}</p>
        <p>Last run label: {facade.stepLabel}</p>
      </section>
    </article>
  );
};
