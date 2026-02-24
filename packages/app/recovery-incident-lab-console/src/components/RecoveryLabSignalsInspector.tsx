import { type ReactElement, useMemo } from 'react';
import type { IncidentLabSignal, IncidentLabPlan } from '@domain/recovery-incident-lab-core';

interface SeverityBucket {
  readonly kind: IncidentLabSignal['kind'];
  readonly count: number;
  readonly top: readonly string[];
}

interface SignalLine {
  readonly index: number;
  readonly kind: IncidentLabSignal['kind'];
  readonly value: number;
  readonly node: string;
  readonly at: string;
}

interface Props {
  readonly title: string;
  readonly signals: readonly IncidentLabSignal[];
  readonly plan?: IncidentLabPlan;
  readonly onRefresh: () => void;
}

const signalBuckets = (signals: readonly IncidentLabSignal[]): readonly SeverityBucket[] => {
  const groups = signals.reduce<Record<IncidentLabSignal['kind'], string[]>>(
    (accumulator, signal) => {
      const bucket = accumulator[signal.kind] ?? [];
      accumulator[signal.kind] = [...bucket, `${signal.node}:${signal.value}`];
      return accumulator;
    },
    {
      capacity: [],
      latency: [],
      integrity: [],
      dependency: [],
    },
  );

  return (Object.entries(groups) as [IncidentLabSignal['kind'], string[]][]).map(([kind, items]) => ({
    kind,
    count: items.length,
    top: items.slice(0, 3),
  }));
};

const signalLines = (signals: readonly IncidentLabSignal[]): readonly SignalLine[] =>
  signals
    .map((signal, index) => ({
      index,
      kind: signal.kind,
      value: signal.value,
      node: signal.node,
      at: signal.at,
    }))
    .sort((left, right) => right.value - left.value || right.at.localeCompare(left.at));

export const RecoveryLabSignalsInspector = ({ title, signals, plan, onRefresh }: Props): ReactElement => {
  const lines = useMemo(() => signalLines(signals), [signals]);
  const buckets = useMemo(() => signalBuckets(signals), [signals]);

  return (
    <section className="recovery-lab-signals-inspector">
      <header>
        <h2>{title}</h2>
        <p>
          {lines.length} signals, {plan ? plan.queue.length : 0} plan steps
        </p>
      </header>
      <button type="button" onClick={onRefresh}>
        Refresh signals
      </button>
      <div>
        <h3>Buckets</h3>
        <ul>
          {buckets.map((bucket) => (
            <li key={bucket.kind}>
              {bucket.kind} × {bucket.count}
              {bucket.top.length > 0 ? ` (${bucket.top.join(', ')})` : ''}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Top signal activity</h3>
        <ol>
          {lines.slice(0, 12).map((line) => (
            <li key={`${line.kind}-${line.index}`}>
              <code>{line.kind}</code> {line.node}={line.value} @ {line.at}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
