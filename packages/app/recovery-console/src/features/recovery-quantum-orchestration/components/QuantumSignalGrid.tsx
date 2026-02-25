import { useMemo } from 'react';
import type { QuantumSignal } from '@domain/recovery-quantum-orchestration';

interface Props {
  readonly signals: readonly QuantumSignal[];
  readonly onSignalPick?: (signal: QuantumSignal) => void;
}

interface SeveritySummary {
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly info: number;
}

const zero: SeveritySummary = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
};

const summarizeSeverity = (signals: readonly QuantumSignal[]): SeveritySummary =>
  signals.reduce(
    (acc, signal) => {
      const bucket = acc[signal.severity];
      return {
        ...acc,
        [signal.severity]: bucket + 1,
      };
    },
    { ...zero },
  );

export const QuantumSignalGrid = ({ signals, onSignalPick }: Props) => {
  const summary = useMemo(() => summarizeSeverity(signals), [signals]);
  const totalScore = useMemo(
    () => signals.reduce((acc, signal) => acc + signal.score, 0),
    [signals],
  );
  const maxScore = signals.reduce((acc, signal) => (signal.score > acc ? signal.score : acc), 0);

  return (
    <section className="quantum-signal-grid">
      <header>
        <h3>Signals</h3>
        <p>Total score: {totalScore.toFixed(3)}</p>
        <p>Max score: {maxScore.toFixed(3)}</p>
      </header>
      <article>
        <h4>Severity summary</h4>
        <ul>
          {Object.entries(summary).map(([label, value]) => (
            <li key={label}>
              {label}: {value}
            </li>
          ))}
        </ul>
      </article>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Severity</th>
            <th>Dimension</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => (
            <tr
              key={signal.id}
              onClick={() => onSignalPick?.(signal)}
            >
              <td>{signal.name}</td>
              <td>{signal.severity}</td>
              <td>{signal.dimension}</td>
              <td>{signal.score.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
