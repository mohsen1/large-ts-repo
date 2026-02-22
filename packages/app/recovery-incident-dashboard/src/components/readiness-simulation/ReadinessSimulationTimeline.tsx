import { useMemo } from 'react';
import type { ReadinessTimelinePoint } from '../../types/readinessSimulationConsole';

export interface ReadinessSimulationTimelineProps {
  readonly points: readonly ReadinessTimelinePoint[];
  readonly windowMinutes: number;
}

export const ReadinessSimulationTimeline = ({ points, windowMinutes }: ReadinessSimulationTimelineProps) => {
  const bars = useMemo(() => {
    const maxSignals = points.length === 0 ? 1 : Math.max(...points.map((point) => point.signals));
    return points.map((point) => {
      const width = (point.signals / maxSignals) * 100;
      const opacity = Math.min(1, Math.max(0.15, point.weightedSeverity / 6));
      return {
        minute: point.minute,
        width,
        opacity,
        signals: point.signals,
      };
    });
  }, [points]);

  return (
    <div className="readiness-simulation-timeline" style={{ paddingTop: '0.5rem' }}>
      <h3>Signal density</h3>
      <p>Window: {windowMinutes}m</p>
      <div>
        {bars.slice(0, 60).map((bar) => (
          <div key={bar.minute} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
            <span style={{ width: '2rem' }}>{bar.minute}</span>
            <span
              style={{
                width: `${Math.max(0.5, bar.width)}%`,
                background: `rgba(32, 128, 256, ${bar.opacity})`,
                color: '#fff',
                padding: '0.15rem',
              }}
            >
              {bar.signals}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
