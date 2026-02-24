import { FC, useMemo } from 'react';
import type { CadencePlanCandidate } from '@domain/recovery-operations-cadence';

export type CadenceReadinessBoardProps = {
  candidates: readonly CadencePlanCandidate[];
  selectedCandidateId?: string;
  onCandidateSelect: (candidateId: string) => void;
};

const severityRank = (severity: CadencePlanCandidate['constraints'][number]['expression']) => {
  if (severity.includes('critical')) return 'high';
  if (severity.includes('>=') || severity.includes('<=')) return 'medium';
  return 'low';
};

export const CadenceReadinessBoard: FC<CadenceReadinessBoardProps> = ({
  candidates,
  selectedCandidateId,
  onCandidateSelect,
}) => {
  const grouped = useMemo(() => {
    const map = new Map<string, CadencePlanCandidate[]>();
    for (const candidate of candidates) {
      const key = String(candidate.profile.source);
      const items = map.get(key) ?? [];
      items.push(candidate);
      map.set(key, items);
    }
    return Array.from(map.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([source, records]) => ({
        source,
        records: records.sort((left, right) => (left.profile.priority > right.profile.priority ? -1 : 1)),
      }));
  }, [candidates]);

  const totals = useMemo(() => {
    const uniqueRuns = new Set(candidates.map((candidate) => candidate.profile.programRun));
    const totalConstraints = candidates.reduce((acc, candidate) => acc + candidate.constraints.length, 0);
    const warningCount = candidates.reduce((acc, candidate) => acc + candidate.notes.length, 0);
    return {
      runCount: uniqueRuns.size,
      candidateCount: candidates.length,
      totalConstraints,
      warningCount,
    };
  }, [candidates]);

  return (
    <section style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
      <h2>Readiness candidates</h2>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <article>
          <strong>Runs</strong>
          <p>{totals.runCount}</p>
        </article>
        <article>
          <strong>Candidates</strong>
          <p>{totals.candidateCount}</p>
        </article>
        <article>
          <strong>Constraints</strong>
          <p>{totals.totalConstraints}</p>
        </article>
        <article>
          <strong>Notes</strong>
          <p>{totals.warningCount}</p>
        </article>
      </section>

      <section style={{ marginTop: 8, display: 'grid', gap: 10 }}>
        {grouped.map((entry) => (
          <article key={entry.source} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
            <h3>Source: {entry.source}</h3>
            <ul>
              {entry.records.map((candidate) => {
                const isSelected = candidate.profile.programRun === selectedCandidateId;
                const priorityBand = severityRank(candidate.constraints[0]?.expression ?? '');
                return (
                  <li
                    key={candidate.profile.programRun}
                    style={{
                      marginBottom: 8,
                      border: isSelected ? '1px solid #2563eb' : '1px solid transparent',
                      borderRadius: 6,
                      padding: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>
                        {candidate.profile.programRun} · rev {candidate.revision}
                      </span>
                      <strong>{candidate.profile.priority}</strong>
                    </div>
                    <p>tenant={candidate.profile.tenant}</p>
                    <p>constraints: {candidate.constraints.length}</p>
                    <p>notes: {candidate.notes.length}</p>
                    <p>Risk band: {priorityBand}</p>
                    <button type="button" onClick={() => onCandidateSelect(candidate.profile.programRun)}>
                      Focus
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
