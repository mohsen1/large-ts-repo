import type { ConductorSignalMatrixCell } from '../types';

interface ConductorSignalMatrixProps {
  readonly tenant: string;
  readonly cells: readonly ConductorSignalMatrixCell[];
}

type SignalBucket = {
  readonly severity: ConductorSignalMatrixCell['severity'];
  readonly count: number;
  readonly sample: string;
};

const buildBuckets = (cells: readonly ConductorSignalMatrixCell[]): readonly SignalBucket[] => {
  const bucketMap = new Map<ConductorSignalMatrixCell['severity'], { count: number; sample: string }>();
  for (const cell of cells) {
    const current = bucketMap.get(cell.severity) ?? { count: 0, sample: cell.key };
    current.count += 1;
    bucketMap.set(cell.severity, current);
  }
  return Array.from(bucketMap.entries()).map(([severity, entry]) => ({
    severity,
    count: entry.count,
    sample: entry.sample,
  }));
};

export const ConductorSignalMatrix = ({ tenant, cells }: ConductorSignalMatrixProps) => {
  const buckets = buildBuckets(cells);
  const hasSignals = cells.length > 0;

  return (
    <section>
      <h2>{`Signals for ${tenant}`}</h2>
      <p>{`entries: ${cells.length}`}</p>
      {hasSignals ? (
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Count</th>
              <th>Sample</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.severity}>
                <td>{bucket.severity}</td>
                <td>{bucket.count}</td>
                <td>{bucket.sample}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>no signals</p>
      )}
      <ul>
        {cells.map((cell) => (
          <li key={cell.signalId}>{`${cell.className}:${cell.signalId}`}</li>
        ))}
      </ul>
    </section>
  );
};
