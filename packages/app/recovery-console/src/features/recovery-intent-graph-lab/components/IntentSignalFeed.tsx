import { iteratorChain } from '@shared/recovery-workbench-runtime';
import type { ServiceSignal } from '../services/intentGraphService';

interface IntentSignalFeedProps {
  readonly signals: readonly ServiceSignal[];
  readonly max: number;
}

export const IntentSignalFeed = ({ signals, max }: IntentSignalFeedProps) => {
  const limited = iteratorChain(signals)
    .filter((signal): signal is ServiceSignal => signal.confidence >= 0)
    .map((signal) => `${signal.eventType} (${signal.confidence})`)
    .take(Math.max(1, max))
    .toArray();

  return (
    <section>
      <h2>Signal feed</h2>
      <ul>
        {limited.map((entry, index) => (
          <li key={`${entry}-${index}`}>{entry}</li>
        ))}
      </ul>
      <p>
        Showing {limited.length} / {signals.length} signals
      </p>
    </section>
  );
};
