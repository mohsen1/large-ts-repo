import type { ReactElement } from 'react';
import { useMemo } from 'react';
import type { DecisionResult } from '@service/recovery-command-intelligence-orchestrator';
import type { WorkspaceState } from '@data/recovery-command-control-plane';

type CommandRiskRadarProps = {
  snapshot: WorkspaceState | null;
  decisions: DecisionResult[];
};

export function CommandRiskRadar({ snapshot, decisions }: CommandRiskRadarProps): ReactElement {
  const buckets = useMemo(() => {
    const values: Record<string, number> = {
      low: 0,
      normal: 0,
      high: 0,
      critical: 0,
    };

    for (const decision of decisions) {
      values[decision.priority] += 1;
    }
    return values;
  }, [decisions]);

  const total = decisions.length || 1;
  const ratios = {
    low: (buckets.low / total) * 100,
    normal: (buckets.normal / total) * 100,
    high: (buckets.high / total) * 100,
    critical: (buckets.critical / total) * 100,
  };

  return (
    <section>
      <h3>Command risk radar</h3>
      <p>
        Intents: {snapshot?.commandIntents.length ?? 0}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 12 }}>
        {Object.entries(ratios).map(([label, value]) => (
          <article key={label} style={{ border: '1px solid #ccc', padding: 12 }}>
            <h4>{label}</h4>
            <p>{`${value.toFixed(1)}%`}</p>
            <progress value={value} max={100} />
          </article>
        ))}
      </div>
    </section>
  );
}
