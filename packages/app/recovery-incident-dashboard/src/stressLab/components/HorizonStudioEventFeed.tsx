import { useMemo } from 'react';
import type { PluginStage, HorizonSignal } from '@domain/recovery-horizon-engine';
import type { HorizonStudioStatus } from '../services/horizonStudioService';

type EventKind = 'all' | PluginStage;

type EventFeedProps = {
  readonly status: HorizonStudioStatus;
  readonly eventKind: EventKind;
  readonly onKindChange: (kind: EventKind) => void;
};

const toSeverity = (signal: HorizonSignal<PluginStage, unknown>) => {
  if (signal.severity === 'critical') {
    return 'critical';
  }
  if (signal.severity === 'high') {
    return 'high';
  }
  if (signal.severity === 'medium') {
    return 'medium';
  }
  return 'low';
};

export const HorizonStudioEventFeed = ({ status, eventKind, onKindChange }: EventFeedProps) => {
  const allSignals = useMemo(() => {
    const list = eventKind === 'all'
      ? status.signals
      : status.signals.filter((signal) => signal.kind === eventKind);

    return list
      .toSorted((left, right) =>
        new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime(),
      )
      .slice(-24)
      .map((signal) => ({
        id: signal.id,
        stage: signal.kind,
        severity: toSeverity(signal),
        label: `${signal.kind.toUpperCase()} @ ${signal.input.tenantId}`,
      }));
  }, [status.signals, eventKind]);

  return (
    <section className="horizon-studio-event-feed">
      <header>
        <h3>Event Feed</h3>
        <select value={eventKind} onChange={(event) => onKindChange(event.target.value as EventKind)}>
          <option value="all">All</option>
          <option value="ingest">ingest</option>
          <option value="analyze">analyze</option>
          <option value="resolve">resolve</option>
          <option value="optimize">optimize</option>
          <option value="execute">execute</option>
        </select>
      </header>

      <ul>
        {allSignals.map((entry) => (
          <li key={entry.id} className={`signal-${entry.severity}`}>
            <strong>{entry.label}</strong>
            <span>{entry.stage}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
