import { useMemo } from 'react';
import type { CampaignRunResult } from '@domain/fault-intel-orchestration';

type SignalSeverity = 'notice' | 'advisory' | 'warning' | 'critical';
type WindowBucket = {
  readonly transport: string;
  readonly count: number;
  readonly severity: SignalSeverity;
};

interface FaultIntelRiskDashboardProps {
  readonly run?: CampaignRunResult;
  readonly onRefresh: () => void;
}

const buildBuckets = (run?: CampaignRunResult): readonly WindowBucket[] => {
  if (!run) {
    return [
      { transport: 'mesh', count: 0, severity: 'notice' },
      { transport: 'fabric', count: 0, severity: 'notice' },
      { transport: 'cockpit', count: 0, severity: 'notice' },
      { transport: 'orchestration', count: 0, severity: 'notice' },
      { transport: 'console', count: 0, severity: 'notice' },
    ];
  }

  const totals: Record<string, number> = {
    mesh: 0,
    fabric: 0,
    cockpit: 0,
    orchestration: 0,
    console: 0,
  };

  const byTransport = run.signals.reduce((acc, signal) => {
    acc[signal.transport] = (acc[signal.transport] ?? 0) + 1;
    return acc;
  }, totals);

  return (Object.entries(byTransport) as [keyof typeof byTransport, number][])
    .map(([transport, count]) => {
      const severity = run.signals.find((signal) => signal.transport === transport)?.severity ?? 'notice';
      return {
        transport,
        count,
        severity,
      } as WindowBucket;
    })
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);
};

const riskTone: Record<string, { background: string; color: string }> = {
  notice: { background: '#0f766e', color: '#d1fae5' },
  advisory: { background: '#2563eb', color: '#dbeafe' },
  warning: { background: '#b45309', color: '#fef3c7' },
  critical: { background: '#b91c1c', color: '#fee2e2' },
};

export const FaultIntelRiskDashboard = ({ run, onRefresh }: FaultIntelRiskDashboardProps) => {
  const buckets = useMemo(() => buildBuckets(run), [run]);

  const summary = useMemo(() => {
    if (!run) {
      return {
        score: '0',
        signals: 0,
        policy: 'n/a',
      };
    }

    const density = run.signals.length === 0 ? 0 : Math.round(run.riskScore / run.signals.length);
    const latest = run.signals.slice(-3).map((signal) => signal.signalId).join(', ');

    return {
      score: density.toString(),
      signals: run.signals.length,
      policy: `${run.policy.name} (${latest || 'no recent signals'})`,
    };
  }, [run]);

  return (
    <section style={{ border: '1px solid #4c1d95', borderRadius: 12, padding: 12, background: '#1e1b4b', color: '#f3e8ff' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Risk dashboard</h3>
        <button type="button" onClick={onRefresh} style={{ borderRadius: 8, border: '1px solid #c4b5fd', padding: '4px 8px' }}>
          refresh metrics
        </button>
      </header>

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '12px 0 0' }}>
        <div style={{ border: '1px solid #a78bfa', borderRadius: 8, padding: 8 }}>
          <dt>Risk density</dt>
          <dd>{summary.score}</dd>
        </div>
        <div style={{ border: '1px solid #a78bfa', borderRadius: 8, padding: 8 }}>
          <dt>Total signals</dt>
          <dd>{summary.signals}</dd>
        </div>
        <div style={{ border: '1px solid #a78bfa', borderRadius: 8, padding: 8 }}>
          <dt>Active policy</dt>
          <dd>{summary.policy}</dd>
        </div>
      </dl>

      <ol style={{ margin: '14px 0 0', paddingLeft: 16, display: 'grid', gap: 8 }}>
        {buckets.length === 0 ? <li>No transport load yet</li> : null}
        {buckets.map((bucket, index) => {
          const palette = riskTone[bucket.severity] ?? { background: '#334155', color: '#f8fafc' };
          return (
            <li key={`${bucket.transport}-${index}`} style={{ display: 'grid', gap: 4 }}>
              <strong style={{ color: '#e2e8f0' }}>{bucket.transport}</strong>
              <span
                style={{
                  display: 'inline-block',
                  width: `${Math.max(12, bucket.count * 6)}px`,
                  height: 10,
                  borderRadius: 99,
                  background: palette.background,
                  color: palette.color,
                }}
              >
                {bucket.count}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
