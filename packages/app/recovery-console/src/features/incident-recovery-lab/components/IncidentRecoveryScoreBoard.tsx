import { useMemo } from 'react';
import { IncidentRecord } from '@domain/incident-management';
import { buildResolutionSummary, buildResolutionRunbook } from '@domain/incident-management';

interface IncidentRecoveryScoreBoardProps {
  readonly incidents: readonly IncidentRecord[];
}

const scoreColor = (value: number): string => {
  if (value >= 75) return '#22c55e';
  if (value >= 50) return '#facc15';
  return '#ef4444';
};

const toReadableDate = (iso: string): string => (iso ? new Date(iso).toLocaleTimeString() : 'n/a');

export const IncidentRecoveryScoreBoard = ({ incidents }: IncidentRecoveryScoreBoardProps) => {
  const records = useMemo(
    () =>
      incidents.map((incident) => {
        const runbook = buildResolutionRunbook(incident);
        const summary = buildResolutionSummary(runbook);
        const throughput = summary.complete / Math.max(1, summary.complete + summary.remaining);
        return {
          id: incident.id,
          title: incident.title,
          score: Number((1 - throughput) * 100),
          remaining: summary.remaining,
          updatedAt: incident.updatedAt,
          ready: incident.state === 'resolved' || (summary.blocked === false && summary.riskScore < 55),
        };
      }),
    [incidents],
  );

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: '1rem', background: '#0b1020', color: '#e2e8f0' }}>
      <h3 style={{ marginTop: 0 }}>Recovery Scoreboard</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #334155', padding: '0.45rem' }}>Incident</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #334155', padding: '0.45rem' }}>Risk</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #334155', padding: '0.45rem' }}>Remaining tasks</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #334155', padding: '0.45rem' }}>Ready</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #334155', padding: '0.45rem' }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {records.map((row) => (
            <tr key={row.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '0.55rem 0.45rem' }}>{row.title}</td>
              <td style={{ padding: '0.55rem 0.45rem', color: scoreColor(row.score) }}>{row.score.toFixed(1)}</td>
              <td style={{ padding: '0.55rem 0.45rem' }}>{row.remaining}</td>
              <td style={{ padding: '0.55rem 0.45rem' }}>{row.ready ? 'yes' : 'no'}</td>
              <td style={{ padding: '0.55rem 0.45rem', color: '#94a3b8' }}>{toReadableDate(row.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
