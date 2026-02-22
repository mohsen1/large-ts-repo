import { useMemo } from 'react';

type ReadinessBucket = {
  readonly band: string;
  readonly score: number;
  readonly trend: 'up' | 'down' | 'flat';
};

interface ReadinessMatrixProps {
  readonly matrix: readonly ReadinessBucket[];
  readonly tenant: string;
}

const bucketColor = (score: number): string => {
  if (score >= 75) return '#2ecc71';
  if (score >= 45) return '#f39c12';
  return '#e74c3c';
};

const computeDelta = (matrix: readonly ReadinessBucket[]) => {
  if (matrix.length < 2) return 0;
  const start = matrix[0]?.score ?? 0;
  const end = matrix[matrix.length - 1]?.score ?? 0;
  return end - start;
};

export const OperationsReadinessMatrix = ({ matrix, tenant }: ReadinessMatrixProps) => {
  const totals = useMemo(() => {
    const average = matrix.length === 0
      ? 0
      : matrix.reduce((sum, item) => sum + item.score, 0) / matrix.length;

    const maxBand = matrix.reduce((current, item) => (item.score > current.score ? item : current), matrix[0] ?? { score: 0, band: 'none', trend: 'flat' });
    const delta = computeDelta(matrix);

    return {
      average,
      maxBand,
      delta,
    };
  }, [matrix]);

  return (
    <section>
      <h3>{`Readiness matrix - ${tenant}`}</h3>
      <p>{`average=${totals.average.toFixed(2)} max=${totals.maxBand.band} delta=${totals.delta.toFixed(2)}`}</p>
      <div className="readiness-matrix">
        {matrix.map((bucket) => (
          <article
            key={bucket.band}
            style={{ borderLeft: `6px solid ${bucketColor(bucket.score)}` }}
          >
            <h4>{bucket.band}</h4>
            <p>{bucket.score}</p>
            <small>{bucket.trend}</small>
          </article>
        ))}
      </div>
    </section>
  );
};
