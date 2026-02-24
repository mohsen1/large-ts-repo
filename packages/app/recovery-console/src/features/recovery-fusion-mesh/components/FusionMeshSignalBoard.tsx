import { useMemo } from 'react';

import type { MeshSignalEnvelope } from '@domain/recovery-fusion-intelligence';

interface FusionMeshSignalBoardProps {
  readonly signals: readonly MeshSignalEnvelope[];
}

export const FusionMeshSignalBoard = ({ signals }: FusionMeshSignalBoardProps) => {
  const { critical, warning, baseline } = useMemo(() => {
    const initial = { critical: [] as MeshSignalEnvelope[], warning: [] as MeshSignalEnvelope[], baseline: [] as MeshSignalEnvelope[] };
    return signals.reduce(
      (acc, signal) => {
        if (signal.class === 'critical') {
          acc.critical.push(signal);
        } else if (signal.class === 'warning') {
          acc.warning.push(signal);
        } else {
          acc.baseline.push(signal);
        }
        return acc;
      },
      initial,
    );
  }, [signals]);

  const buckets = useMemo(
    () =>
      [
        ['critical', critical],
        ['warning', warning],
        ['baseline', baseline],
      ] as const,
    [critical, warning, baseline],
  );

  const rendered = buckets.map(([bucket, items]) => {
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

  return <section className="fusion-mesh-signal-board">{rendered}</section>;
};
