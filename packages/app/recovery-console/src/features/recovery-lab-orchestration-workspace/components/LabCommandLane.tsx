import { useMemo } from 'react';
import type { LaneHealth } from '../types';
import { laneTrend } from '../hooks/useLaneDashboard';

type LaneColor = 'green' | 'amber' | 'red';

interface LaneStat {
  readonly label: string;
  readonly score: number;
  readonly healthy: boolean;
}

interface LabCommandLaneProps {
  readonly lanes: readonly LaneHealth[];
}

export const LabCommandLane = ({ lanes }: LabCommandLaneProps) => {
  const stats = useMemo(
    () =>
      lanes.map((lane) => ({
        lane,
        label: lane.lane,
        scoreClass: (lane.score > 80 ? 'green' : lane.score > 50 ? 'amber' : 'red') as LaneColor,
        healthy: lane.score >= 75 && lane.state !== 'degraded',
      })),
    [lanes],
  );

  const trend = laneTrend(
    stats.map(
      (item): { label: string; score: number; healthy: boolean } => ({
        label: item.label,
        score: item.lane.score,
        healthy: item.healthy,
      }),
    ),
  );

  return (
    <section className="lab-command-lane">
      <header>
        <h3>Lane Health</h3>
        <p>{`Trend: ${trend}`}</p>
      </header>
      <div className="lab-lane-grid">
        {stats.map(({ lane, scoreClass }) => (
          <article key={lane.lane} className={`lane-card ${scoreClass}`}>
            <h4>{lane.lane}</h4>
            <p>{`Score: ${lane.score}`}</p>
            <p>{`State: ${lane.state}`}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
