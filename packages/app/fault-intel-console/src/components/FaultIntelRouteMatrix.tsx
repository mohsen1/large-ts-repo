import { useMemo } from 'react';
import type { CampaignRunResult } from '@domain/fault-intel-orchestration';

interface FaultIntelRouteMatrixProps {
  readonly run?: CampaignRunResult;
  readonly title: string;
}

export const FaultIntelRouteMatrix = ({ run, title }: FaultIntelRouteMatrixProps) => {
  const matrix = useMemo(() => {
    if (!run) {
      return [{ key: 'empty', label: 'No routes', value: '0' }];
    }
    const buckets = run.signals.reduce<Record<string, number>>((acc, signal) => {
      const key = `${signal.transport}:${signal.severity}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(buckets).map(([key, value]) => ({
      key,
      label: `Route ${key}`,
      value: String(value),
    }));
  }, [run]);

  return (
    <section style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 12, background: 'rgba(2,6,23,0.75)' }}>
      <h3 style={{ margin: 0, color: '#e2e8f0' }}>{title}</h3>
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        {matrix.map((item) => (
          <article key={item.key} style={{ border: '1px solid #334155', padding: 8, borderRadius: 8 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>{item.label}</p>
            <small style={{ color: '#94a3b8' }}>{item.value}</small>
          </article>
        ))}
      </div>
    </section>
  );
};
