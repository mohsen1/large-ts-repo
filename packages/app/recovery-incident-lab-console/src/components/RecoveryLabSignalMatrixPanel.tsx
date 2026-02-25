import { type ReactElement, useMemo } from 'react';
import type { StrategyMode, StrategyLane } from '@domain/recovery-lab-intelligence-core';
import type { SignalEvent } from '@domain/recovery-lab-intelligence-core';

interface Props {
  readonly matrix?: readonly SignalEvent[] | null;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
  readonly summary: readonly string[];
}

const empty = [] as const;
const severityWeight = (severity: SignalEvent['severity']): number =>
  severity === 'info' ? 1 : severity === 'warn' ? 2 : severity === 'error' ? 3 : severity === 'critical' ? 5 : 8;

export const RecoveryLabSignalMatrixPanel = ({ matrix, mode, lane, summary }: Props): ReactElement => {
  const safeMatrix = matrix ?? empty;

  const grouped = useMemo(() => {
    const severity = safeMatrix.reduce<Record<string, number>>((acc, event) => {
      const key = `${event.source}::${event.severity}`;
      return {
        ...acc,
        [key]: (acc[key] ?? 0) + 1,
      };
    }, {});

    return Object.entries(severity)
      .map(([entry, count]) => {
        const [source, level] = entry.split('::');
        return {
          source,
          level,
          count,
          id: `${source}:${level}`,
        };
      })
      .toSorted((left, right) => right.count - left.count);
  }, [safeMatrix]);

  const ranked = useMemo(() => grouped.map((entry) => ({
    ...entry,
    weighted: severityWeight(entry.level as SignalEvent['severity']) * entry.count,
  })).toSorted((left, right) => right.weighted - left.weighted), [grouped]);

  const top = useMemo(() => {
    const topEntries = ranked.slice(0, 6);
    const labels = topEntries.map((entry, index) => `${index + 1}. ${entry.id} (${entry.weighted})`);
    return labels.join(' | ');
  }, [ranked]);

  const modeWeight = useMemo(() => mode === 'stress' ? 4 : mode === 'plan' ? 3 : 2, [mode]);
  const laneWeight = useMemo(() => lane.length + modeWeight, [lane, modeWeight]);
  const impact = laneWeight * modeWeight;

  const hasEntries = safeMatrix.length > 0;

  return (
    <section className="recovery-lab-signal-matrix-panel">
      <h3>Signal Matrix</h3>
      <p>
        lane={lane} mode={mode} weight={laneWeight} impact={impact}
      </p>
      <p>entries: {safeMatrix.length}</p>
      <p>top signatures: {top || 'none'}</p>
      <p>has entries: {String(hasEntries)}</p>
      <ul>
        {grouped.slice(0, 12).map((entry, index) => (
          <li key={`${entry.id}-${index}`}>
            {entry.source} / {entry.level}: {entry.count}
          </li>
        ))}
      </ul>
      <ul>
        {ranked.slice(0, 8).map((entry) => (
          <li key={`${entry.id}-weight`}>
            {entry.id}: {entry.count} raw / {entry.weighted} weighted
          </li>
        ))}
      </ul>
      <section>
        <h4>Summary tokens</h4>
        <ul>
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </section>
  );
};
