import { useMemo } from 'react';

import type { ConstellationHookState, ConstellationTimelinePoint } from '../types';

interface ConstellationTimelineProps {
  readonly state: ConstellationHookState;
  readonly timeline: readonly ConstellationTimelinePoint[];
}

const riskToLevel = (risk: number): 'low' | 'mid' | 'high' => (risk < 0.3 ? 'low' : risk < 0.7 ? 'mid' : 'high');

const riskClass = (risk: number): string => `risk-${riskToLevel(risk)}`;

export const ConstellationTimeline = ({ state, timeline }: ConstellationTimelineProps) => {
  const ordered = useMemo(() => [...timeline].sort((left, right) => left.timestamp.localeCompare(right.timestamp)), [timeline]);

  return (
    <section className="recovery-command-constellation-timeline">
      <h2>Constellation Timeline</h2>
      {state.loading ? <p>Loading timeline...</p> : null}
      <ol>
        {ordered.map((point, index) => {
          const marker = `${point.timestamp}-${point.phase}`;
          return (
            <li key={marker}>
              <article className={riskClass(point.risk)}>
                <p>
                  {index + 1}. {point.phase}
                </p>
                <p>{new Date(point.timestamp).toLocaleTimeString()}</p>
                <p>{Math.round(point.risk * 100)}%</p>
              </article>
            </li>
          );
        })}
      </ol>
      <footer>
        <p>Phases: {ordered.length}</p>
      </footer>
    </section>
  );
};
