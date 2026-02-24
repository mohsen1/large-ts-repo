import { FC, useMemo } from 'react';
import type { CadencePlanCandidate } from '@domain/recovery-operations-cadence';

export type CadenceReadinessDashboardProps = {
  readonly candidates: readonly CadencePlanCandidate[];
  readonly selectedCandidateId: string;
  readonly onSelect: (candidateId: string) => void;
  readonly onRefresh: () => void;
};

type Metric = {
  readonly label: string;
  readonly value: number | string;
  readonly hint: string;
};

const collectMetric = (candidates: readonly CadencePlanCandidate[]): Metric[] => {
  const uniqueWindows = new Set(
    candidates.flatMap((candidate) => candidate.profile.windows.map((window) => String(window.id))),
  );
  const avgRevision = candidates.length === 0 ? 0 : candidates.reduce((acc, candidate) => acc + candidate.revision, 0) / candidates.length;
  const constraintDensity =
    candidates.length === 0
      ? 0
      : candidates.reduce((acc, candidate) => acc + candidate.constraints.length / Math.max(1, candidate.profile.slots.length), 0) /
          candidates.length;

  return [
    { label: 'Candidates', value: candidates.length, hint: 'Total candidate plans' },
    { label: 'Windows', value: uniqueWindows.size, hint: 'Distinct windows across candidates' },
    { label: 'Avg revision', value: Number(avgRevision.toFixed(2)), hint: 'Computed from revision history' },
    {
      label: 'Constraint density',
      value: Number(constraintDensity.toFixed(3)),
      hint: 'constraints per slot average',
    },
  ];
};

const rankBySeverity = (severity: CadencePlanCandidate['constraints'][number]['expression']): 'critical' | 'high' | 'low' => {
  if (severity.includes('max') || severity.includes('<=') || severity.includes('>= ')) {
    return 'high';
  }
  if (severity.includes('retry') || severity.includes('coverage')) {
    return 'critical';
  }
  return 'low';
};

export const CadenceReadinessDashboard: FC<CadenceReadinessDashboardProps> = ({
  candidates,
  selectedCandidateId,
  onSelect,
  onRefresh,
}) => {
  const metrics = useMemo(() => collectMetric(candidates), [candidates]);
  const grouped = useMemo(() => {
    const buckets = new Map<string, CadencePlanCandidate[]>();
    for (const candidate of candidates) {
      const source = candidate.profile.source;
      const existing = buckets.get(source) ?? [];
      existing.push(candidate);
      buckets.set(source, existing);
    }

    return Array.from(buckets.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([source, list]) => ({ source, list: [...list].slice(0, 8) }));
  }, [candidates]);

  return (
    <section style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Readiness dashboard</h2>
        <button type="button" onClick={onRefresh}>
          refresh
        </button>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {metrics.map((metric) => (
          <article
            key={metric.label}
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}
          >
            <h3>{metric.label}</h3>
            <p>{metric.value}</p>
            <small>{metric.hint}</small>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {grouped.map((bucket) => (
          <article key={bucket.source} style={{ border: '1px solid #dbeafe', borderRadius: 8, padding: 8 }}>
            <h3>Source {bucket.source}</h3>
            <ul>
              {bucket.list.map((candidate) => {
                const isSelected = candidate.profile.programRun === selectedCandidateId;
                const rank = rankBySeverity(candidate.constraints[0]?.expression ?? '');
                return (
                  <li
                    key={candidate.profile.programRun}
                    style={{
                      marginBottom: 8,
                      border: isSelected ? '1px solid #2563eb' : '1px solid transparent',
                      borderRadius: 6,
                      padding: 8,
                    }}
                  >
                    <strong>{candidate.profile.programRun}</strong>
                    <p>
                      priority={candidate.profile.priority} · revision={candidate.revision}
                    </p>
                    <p>
                      windows={candidate.profile.windows.length} slots={candidate.profile.slots.length} constraints={
                        candidate.constraints.length
                      }
                    </p>
                    <p>notes={candidate.notes.length} risk={rank}</p>
                    <button type="button" onClick={() => onSelect(candidate.profile.programRun)}>
                      focus
                    </button>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>
    </section>
  );
};
