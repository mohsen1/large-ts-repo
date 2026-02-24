import { useMemo } from 'react';
import { RecoveryBlueprint, summarizeBlueprint } from '@domain/recovery-cockpit-models';

const riskBand = (risk: number): 'low' | 'medium' | 'high' | 'critical' => {
  if (risk < 25) return 'low';
  if (risk < 50) return 'medium';
  if (risk < 75) return 'high';
  return 'critical';
};

const riskColor: Record<ReturnType<typeof riskBand>, string> = {
  low: '#16a34a',
  medium: '#ca8a04',
  high: '#ea580c',
  critical: '#dc2626',
};

type BlueprintTimelineProps = {
  readonly blueprint: RecoveryBlueprint | null;
  readonly compact?: boolean;
  readonly onSelectStep?: (stepId: string) => void;
};

const formatMs = (left: number, right: number): string => {
  const value = right - left;
  return `${Math.max(1, value)}ms`;
};

const buildStageBuckets = (blueprint: RecoveryBlueprint): ReadonlyMap<string, number> => {
  const buckets = new Map<string, number>();
  for (const step of blueprint.steps) {
    const count = buckets.get(step.stage) ?? 0;
    buckets.set(step.stage, count + 1);
  }
  return buckets;
};

export const BlueprintTimeline = ({ blueprint, compact = false, onSelectStep }: BlueprintTimelineProps) => {
  const summary = useMemo(() => (blueprint ? summarizeBlueprint(blueprint) : null), [blueprint]);
  const buckets = useMemo(() => (blueprint ? buildStageBuckets(blueprint) : new Map<string, number>()), [blueprint]);
  const items = useMemo(() => (blueprint ? [...blueprint.steps] : []), [blueprint]);
  const ordered = useMemo(() => {
    const left = [...items].toSorted((left, right) => left.expectedDurationMinutes - right.expectedDurationMinutes);
    const right = [...left].sort((leftStep, rightStep) => leftStep.index - rightStep.index);
    return right;
  }, [items]);

  if (!blueprint) {
    return (
      <section
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 14,
          color: '#64748b',
          background: compact ? 'transparent' : '#f8fafc',
        }}
      >
        No blueprint selected
      </section>
    );
  }

  return (
    <section
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 14,
        background: 'linear-gradient(180deg,#fef2f2,#fff)',
      }}
    >
      <div style={{ marginBottom: 12, display: 'grid', gap: 4 }}>
        <h3 style={{ margin: 0, color: '#0f172a' }}>{blueprint.steps[0]?.name ?? 'Blueprint'}</h3>
        <p style={{ margin: 0, color: '#334155' }}>{blueprint.status}</p>
        {summary ? (
          <p style={{ margin: 0 }}>
            {summary.id} · Risk {summary.risk} ·
            <span style={{ color: riskColor[riskBand(summary.risk)] }}>
              {' '}
              {riskBand(summary.risk)}
            </span>
          </p>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(240px, 1fr) auto', gap: 12 }}>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 8 }}>
          <dt style={{ fontWeight: 600 }}>Steps</dt>
          <dd style={{ margin: 0 }}>{blueprint.steps.length}</dd>

          <dt style={{ fontWeight: 600 }}>Stages</dt>
          <dd style={{ margin: 0 }}>{blueprint.stages.length}</dd>

          <dt style={{ fontWeight: 600 }}>Status</dt>
          <dd style={{ margin: 0 }}>{blueprint.status}</dd>
        </dl>

        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: compact ? '100%' : 420 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Stage</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {[...buckets.entries()].map(([stage, count]) => (
              <tr key={stage}>
                <td style={{ padding: '4px 8px 4px 0' }}>{stage}</td>
                <td style={{ textAlign: 'right' }}>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul style={{ marginTop: 12, marginBottom: 0, paddingLeft: 16, display: 'grid', gap: 8 }}>
        {ordered.map((step) => {
          const duration = formatMs(0, step.expectedDurationMinutes * 1_000);
          return (
            <li
              key={step.stepId}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 8,
                listStyle: 'none',
                background: 'white',
              }}
            >
              <button
                type="button"
                onClick={() => onSelectStep?.(step.stepId)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  textAlign: 'left',
                  width: '100%',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600 }}>{step.name}</div>
                <div style={{ color: '#475569', fontSize: 13 }}>
                  {step.stage} · {step.lane} · {duration}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
