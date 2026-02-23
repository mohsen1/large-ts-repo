import { useMemo } from 'react';
import { StreamHealthSignal } from '@domain/streaming-observability';

export interface StreamHealthCardProps {
  streamId: string;
  signals: StreamHealthSignal[];
  onAcknowledge: (streamId: string, signal: StreamHealthSignal) => void;
}

export function StreamHealthCard({ streamId, signals, onAcknowledge }: StreamHealthCardProps) {
  const summary = useMemo(() => {
    const critical = signals.filter((signal) => signal.level === 'critical').length;
    const warning = signals.filter((signal) => signal.level === 'warning').length;
    const ok = signals.length - critical - warning;
    return { critical, warning, ok, total: signals.length };
  }, [signals]);

  return (
    <section>
      <header>
        <h2>Stream Health: {streamId}</h2>
      </header>
      <p>Critical: {summary.critical}</p>
      <p>Warning: {summary.warning}</p>
      <p>Healthy: {summary.ok}</p>
      <ul>
        {signals.map((signal) => (
          <li key={`${signal.streamId}-${signal.observedAt}-${signal.details.join(':')}`}>
            <span>
              [{signal.level}] {signal.streamId} {signal.score.toFixed(2)}
            </span>
            <button
              type="button"
              onClick={() => onAcknowledge(signal.streamId, signal)}
            >
              Acknowledge
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
