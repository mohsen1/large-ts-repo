import { useMemo } from 'react';

import type { ConstellationPolicyInsight } from '../types';

interface ConstellationPolicyHeatmapProps {
  readonly insights: readonly ConstellationPolicyInsight[];
  readonly title: string;
}

const clamp = (value: number, floor: number, ceiling: number): number =>
  Math.max(floor, Math.min(ceiling, value));

const toWidthPercent = (score: number): number => clamp(score * 100, 0, 100);

export const ConstellationPolicyHeatmap = ({ insights, title }: ConstellationPolicyHeatmapProps) => {
  const normalized = useMemo(
    () =>
      insights
        .map((insight) => ({
          ...insight,
          width: toWidthPercent(insight.score),
        }))
        .sort((left, right) => right.width - left.width),
    [insights],
  );

  return (
    <section className="recovery-command-constellation-heatmap">
      <h2>{title}</h2>
      <ul>
        {normalized.map((entry) => (
          <li key={entry.key}>
            <strong>{entry.key}</strong>
            <div style={{ width: `${entry.width}%`, background: `var(--risk-${entry.status})` }}>
              {Math.round(entry.width)}%
            </div>
            <p>{entry.status}</p>
          </li>
        ))}
      </ul>
    </section>
  );
};
