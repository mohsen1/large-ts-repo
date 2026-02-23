import { useMemo } from 'react';
import type { OrchestrationSnapshot } from '@service/recovery-ops-playbook-orchestrator';

interface TimelineProps {
  readonly snapshot?: OrchestrationSnapshot;
  readonly onSelectStep?: (stepId: string) => void;
}

interface TimelineSegment {
  readonly id: string;
  readonly label: string;
  readonly durationSeconds: number;
  readonly status: 'ok' | 'warn' | 'critical';
}

const buildSegments = (snapshot?: OrchestrationSnapshot): TimelineSegment[] => {
  if (!snapshot?.run.outcomeByStep) {
    return [];
  }

  return Object.entries(snapshot.run.outcomeByStep).map(([stepId, outcome]) => {
    const duration = Math.max(0, outcome.finishedAt ?
      (Date.parse(outcome.finishedAt) - Date.parse(outcome.startedAt ?? snapshot.run.startedAt)) / 1000 :
      outcome.attempt * 30);

    const status =
      outcome.status === 'failed'
        ? 'critical'
        : outcome.status === 'running'
          ? 'warn'
          : 'ok';

    return {
      id: stepId,
      label: `${stepId} (${outcome.status})`,
      durationSeconds: Math.round(duration),
      status,
    };
  });
};

const statusToColor = {
  ok: '#22c55e',
  warn: '#eab308',
  critical: '#ef4444',
};

export const RecoveryPlaybookTimeline = ({ snapshot, onSelectStep }: TimelineProps) => {
  const segments = useMemo(() => buildSegments(snapshot), [snapshot]);
  const total = segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);

  const durationLabel = (seconds: number): string => {
    if (seconds > 3600) {
      return `${(seconds / 3600).toFixed(2)}h`;
    }
    if (seconds > 60) {
      return `${(seconds / 60).toFixed(1)}m`;
    }
    return `${seconds}s`;
  };

  return (
    <section style={{
      padding: '0.9rem',
      borderRadius: '0.8rem',
      border: '1px solid rgba(148,163,184,0.2)',
      background: 'radial-gradient(circle at top right, rgba(56,189,248,0.14), rgba(15,23,42,0.4))',
      color: '#e2e8f0',
      display: 'grid',
      gap: '0.85rem',
    }}>
      <h3 style={{ margin: '0 0 0.2rem' }}>Timeline</h3>
      <p style={{ margin: 0, color: '#94a3b8' }}>Total active latency: {durationLabel(total)}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        {segments.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>No timeline data available yet.</div>
        ) : (
          segments.map((segment) => (
            <button
              key={segment.id}
              onClick={() => onSelectStep?.(segment.id)}
              type="button"
              style={{
                all: 'unset',
                border: `1px solid ${statusToColor[segment.status]}`,
                borderRadius: '0.7rem',
                padding: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                background: 'rgba(15,23,42,0.65)',
              }}
            >
              <span>{segment.label}</span>
              <span style={{ color: statusToColor[segment.status], fontWeight: 700 }}>{durationLabel(segment.durationSeconds)}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
};
