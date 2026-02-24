import { useMemo } from 'react';
import { type StressLabOrchestratorReport } from '@service/recovery-stress-lab-orchestrator';

interface StressLabConvergenceTimelineProps {
  readonly report: StressLabOrchestratorReport | null;
  readonly active: boolean;
}

const pad = (value: number): string => String(value).padStart(2, '0');

const buildBands = (count: number): readonly string[] => {
  const length = Math.max(12, count);
  return [...Array(length).keys()].map((index) => (index % 2 === 0 ? 'high' : 'low'));
};

const routeColor = {
  low: '#94a3b8',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
} as const satisfies Record<string, string>;

const toBars = (count: number): readonly React.ReactNode[] =>
  buildBands(count).map((band, index) => (
    <span
      key={`${band}-${index}`}
      title={`${band}-${index}`}
      style={{
        display: 'inline-block',
        width: 18,
        height: 10,
        borderRadius: 4,
        background: routeColor[band as keyof typeof routeColor],
        marginRight: 4,
      }}
    />
  ));

export const StressLabConvergenceTimeline = ({ report, active }: StressLabConvergenceTimelineProps) => {
  const started = useMemo(() => {
    const now = new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }, []);

  const bars = useMemo(() => (active ? toBars(28) : []), [active]);
  const route = report?.route ?? 'idle';

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 10, padding: '0.85rem', display: 'grid', gap: '0.5rem' }}>
      <h4 style={{ margin: 0 }}>Convergence Timeline</h4>
      <p style={{ margin: 0, color: '#94a3b8' }}>Started at {started}</p>
      <p style={{ margin: 0 }}>Route signature: {route}</p>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 18 }}>{bars}</div>
      </div>
      <p style={{ margin: 0, color: active ? '#86efac' : '#94a3b8' }}>
        {active ? 'Collecting and scoring phases' : 'Idle'}
      </p>
    </section>
  );
};
