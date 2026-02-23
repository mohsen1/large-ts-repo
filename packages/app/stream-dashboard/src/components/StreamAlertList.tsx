import { StreamHealthSignal } from '@domain/streaming-observability';

export interface StreamAlertListProps {
  signals: StreamHealthSignal[];
  onClear: (streamId: string, observedAt: string) => void;
}

export function StreamAlertList({ signals, onClear }: StreamAlertListProps) {
  return (
    <section>
      <h3>Active Alerts</h3>
      <ul>
        {signals.map((signal) => (
          <li key={`${signal.streamId}:${signal.observedAt}:${signal.details.join(':')}`}>
            <strong>{signal.streamId}</strong>
            <span> {signal.level}</span>
            <span> score={signal.score.toFixed(2)}</span>
            <button type="button" onClick={() => onClear(signal.streamId, signal.observedAt)}>
              clear
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
