import type { MeshSignalEnvelope } from '@domain/recovery-fusion-intelligence';

interface FusionMeshSignalBoardProps {
  readonly signals: readonly MeshSignalEnvelope[];
}

export const FusionMeshSignalBoard = ({ signals }: FusionMeshSignalBoardProps) => {
  const signalBuckets = signals.reduce(
    (acc, signal) => {
      const bucket = acc.get(signal.class) ?? [];
      bucket.push(signal);
      acc.set(signal.class, bucket);
      return acc;
    },
    new Map<string, typeof signals>(),
  );

  const buckets = ['critical', 'warning', 'baseline'].map((bucket) => {
    const items = signalBuckets.get(bucket) ?? [];
    const rendered = items.map((signal) => (
      <li key={signal.id}>
        <span>{signal.source}</span>
        {' -> '}
        <span>{signal.target ?? 'n/a'}</span>
        {' | '}
        <span>{signal.severity}</span>
      </li>
    ));

    return (
      <section key={bucket}>
        <h4>{bucket}</h4>
        <ul>{rendered}</ul>
      </section>
    );
  });

  return <section className="fusion-mesh-signal-board">{buckets}</section>;
};
