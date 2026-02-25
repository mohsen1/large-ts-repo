import { useMemo } from 'react';

interface TimelineGate {
  readonly token: string;
  readonly phase: 'ingress' | 'transform' | 'egress';
  readonly status: 'queued' | 'active' | 'resolved';
  readonly score: number;
}

interface PolicyWindowTimelineProps {
  readonly gates: readonly TimelineGate[];
  readonly windowId: string;
}

const formatPercent = (value: number): string => `${Math.min(100, Math.max(0, value * 100)).toFixed(1)}%`;

export const PolicyWindowTimeline = ({ gates, windowId }: PolicyWindowTimelineProps) => {
  const ordered = useMemo(() => gates.toSorted((left, right) => left.token.localeCompare(right.token)), [gates]);
  const maxScore = useMemo(() => ordered.reduce((acc, gate) => Math.max(acc, gate.score), 0), [ordered]);

  const phases = {
    ingress: ordered.filter((entry) => entry.phase === 'ingress').length,
    transform: ordered.filter((entry) => entry.phase === 'transform').length,
    egress: ordered.filter((entry) => entry.phase === 'egress').length,
  };

  return (
    <section style={{ border: '1px solid #d1d5db', padding: 14, borderRadius: 10, marginTop: 16, background: '#f9fafb' }}>
      <h3>Window timeline</h3>
      <p style={{ marginTop: 0 }}>window={windowId}</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <span>ingress: {phases.ingress}</span>
        <span>transform: {phases.transform}</span>
        <span>egress: {phases.egress}</span>
      </div>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {ordered.map((gate) => (
          <div
            key={gate.token}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '8px 10px',
              background: gate.status === 'resolved' ? '#ecfdf5' : '#fff',
            }}
          >
            <p style={{ margin: 0 }}>{gate.token}</p>
            <p style={{ margin: '4px 0' }}>{gate.phase}</p>
            <p style={{ margin: 0 }}>{formatPercent(gate.score / Math.max(1, maxScore))}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
