import { useMemo, type ReactElement } from 'react';
import { buildCoverageWeights, aggregateCoverageRisk, summarizeCoverage } from '@domain/recovery-continuity-readiness';
import type { ContinuityReadinessCoverage } from '@domain/recovery-continuity-readiness';

interface Props {
  readonly title: string;
  readonly coverage: readonly ContinuityReadinessCoverage[];
}

export const ContinuityReadinessRadar = ({ title, coverage }: Props): ReactElement => {
  const weights = useMemo(() => buildCoverageWeights([]), [coverage]);
  const score = useMemo(() => aggregateCoverageRisk(coverage), [coverage]);
  const summary = useMemo(() => summarizeCoverage(coverage), [coverage]);

  return (
    <section style={{ border: '1px solid #dadce0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <h3>{title}</h3>
      <p>{summary}</p>
      <p>Coverage score: {score}</p>
      <p>Weight series: {weights.length}</p>
      <div style={{ display: 'grid', gap: 4 }}>
        {coverage.map((entry) => (
          <article key={entry.objectiveId} style={{ borderTop: '1px dotted #bbb', paddingTop: 4 }}>
            <strong>{entry.objectiveName}</strong>
            <p>{`score=${entry.score} weight=${entry.weight} band=${entry.riskBand}`}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
