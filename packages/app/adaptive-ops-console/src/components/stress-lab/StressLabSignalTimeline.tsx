import { useEffect, useMemo, useState } from 'react';
import { type RecoverySignal } from '@domain/recovery-stress-lab';

interface TimelinePoint {
  readonly index: number;
  readonly id: string;
  readonly label: string;
  readonly ageMs: number;
  readonly group: 'high' | 'low';
}

interface SignalTimelineProps {
  readonly signals: readonly RecoverySignal[];
  readonly active?: readonly string[];
}

const classify = (severity: RecoverySignal['severity']): 'high' | 'low' => {
  if (severity === 'critical' || severity === 'high') return 'high';
  return 'low';
};

const estimateAge = (createdAt: string): number => {
  const created = new Date(createdAt).getTime();
  return Number.isFinite(created) ? Date.now() - created : 0;
};

const pointsForSignals = (signals: readonly RecoverySignal[]): readonly TimelinePoint[] => {
  return signals.map((signal, index) => ({
    index,
    id: signal.id,
    label: signal.title,
    ageMs: estimateAge(signal.createdAt),
    group: classify(signal.severity),
  }));
};

const sortByAge = (left: TimelinePoint, right: TimelinePoint): number => right.ageMs - left.ageMs;

export const StressLabSignalTimeline = ({ signals, active = [] }: SignalTimelineProps) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handle = setInterval(() => setTick((value) => value + 1), 5_000);
    return () => clearInterval(handle);
  }, []);

  const points = useMemo(() => pointsForSignals(signals).toSorted(sortByAge), [signals]);
  const visible = useMemo(
    () => points.filter((point) => active.length === 0 || active.includes(point.id)),
    [points, active],
  );

  const highCount = useMemo(() => visible.filter((point) => point.group === 'high').length, [visible]);
  const oldest = useMemo(() => visible[0]?.ageMs ?? 0, [visible]);

  return (
    <section className="stress-lab-signal-timeline">
      <h3>Signal timeline</h3>
      <p>
        Total: {visible.length} high: {highCount} oldest: {Math.max(0, Math.floor(oldest / 1000))}s refresh:{tick}
      </p>
      <ul>
        {visible.map((point) => (
          <li key={point.id}>
            <code>
              [{point.group}] {point.id}
            </code>
            <span>{point.label}</span>
            <small>{Math.floor(point.ageMs / 1000)}s</small>
          </li>
        ))}
      </ul>
    </section>
  );
};
