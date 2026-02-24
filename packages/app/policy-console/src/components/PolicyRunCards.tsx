import { useMemo } from 'react';
import { usePolicyTelemetryStream, PolicyTelemetryPoint } from '../hooks/usePolicyTelemetryStream';

export interface PolicyRunCard {
  key: string;
  title: string;
  rows: readonly string[];
}

interface PolicyRunCardsProps {
  orchestratorId: string;
}

const formatPoint = (point: PolicyTelemetryPoint): readonly string[] => {
  return Object.entries(point.labels).map(([label, value]) => `${label}=${value}`);
}

const mergeRows = (points: readonly PolicyTelemetryPoint[]): readonly string[] =>
  points.flatMap((point) => [
    `${point.generatedAt}:${point.runId}`,
    ...formatPoint(point),
  ]);

export const PolicyRunCards = ({ orchestratorId }: PolicyRunCardsProps) => {
  const { points, summary } = usePolicyTelemetryStream({
    orchestratorId,
    intervalMs: 900,
    keep: 30,
  });
  const cards = useMemo<readonly PolicyRunCard[]>(() => {
    const grouped = new Map<string, string[]>();
    for (const point of points) {
      const key = point.runId.split(':')[0] ?? 'run';
      const bucket = grouped.get(key) ?? [];
      bucket.push(...formatPoint(point));
      grouped.set(key, bucket);
    }
    return [...grouped.entries()].map(([key, rows]) => ({
      key,
      title: key,
      rows,
    }));
  }, [points]);

  return (
    <section>
      <h3>Run Telemetry Cards</h3>
      <p>
        samples={summary.count} latest={summary.latestRunId} streaming={String(summary.isStreaming)}
      </p>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {cards.map((card) => (
          <article key={card.key} style={{ border: '1px solid #ddd', padding: '0.5rem', borderRadius: '6px' }}>
            <h4>{card.title}</h4>
            <ul>
              {mergeRows(points).slice(0, 8).map((line) => (
                <li key={`${card.key}:${line}`}>{line}</li>
              ))}
            </ul>
            <p>rows={card.rows.length}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

