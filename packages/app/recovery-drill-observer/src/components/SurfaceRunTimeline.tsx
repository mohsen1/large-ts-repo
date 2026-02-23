import type { SurfaceAnalysis } from '@service/recovery-drill-surface-orchestrator';

interface Props {
  readonly analyses: readonly SurfaceAnalysis[];
  readonly onSelect: (runId: string) => void;
}

interface TimelinePoint {
  readonly runId: string;
  readonly score: number;
  readonly risk: number;
}

const buildTrend = (values: readonly number[]): 'rising' | 'falling' | 'flat' => {
  if (values.length < 2) {
    return 'flat';
  }

  const first = values[0];
  const last = values[values.length - 1];

  if (last === undefined || first === undefined) {
    return 'flat';
  }

  if (last > first) {
    return 'rising';
  }

  if (last < first) {
    return 'falling';
  }

  return 'flat';
};

const pointToScore = (item: SurfaceAnalysis): TimelinePoint => ({
  runId: item.runId,
  score: item.score,
  risk: item.risk,
});

const asRows = (points: readonly TimelinePoint[]) => {
  return points.map((point, index) => ({
    ...point,
    index,
    delta: index === 0 ? 0 : point.score - points[index - 1]!.score,
  }));
};

export const SurfaceRunTimeline = ({ analyses, onSelect }: Props) => {
  const points = analyses.map(pointToScore);
  const rows = asRows(points);
  const trend = buildTrend(points.map((point) => point.score));

  return (
    <section>
      <h2>Run timeline</h2>
      <p>Trend: {trend}</p>
      <ol style={{ listStyle: 'none', padding: 0 }}>
        {rows.map((row) => (
          <li key={row.runId} style={{ marginBottom: 8 }}>
            <article style={{ border: '1px solid #ccc', borderRadius: 8, padding: 10 }}>
              <p>
                {row.index} · {row.runId}
              </p>
              <p>
                score {row.score} risk {row.risk} delta {row.delta}
              </p>
              <button type="button" onClick={() => onSelect(row.runId)}>
                Select
              </button>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
};
