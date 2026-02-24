import { FC, useMemo } from 'react';
import type { CadencePlanCandidate } from '@domain/recovery-operations-cadence';

type ConsoleCandidate = CadencePlanCandidate | null;

type ConstraintSignal = {
  readonly key: string;
  readonly count: number;
};

type ExecutionWindowDensityMap = ReadonlyMap<string, number>;

export type CadenceExecutionConsoleProps = {
  readonly candidates: readonly CadencePlanCandidate[];
  readonly selectedCandidate: ConsoleCandidate;
  readonly signalDensity: number;
  readonly topConstraintSignals: readonly ConstraintSignal[];
  readonly planDensityById: ExecutionWindowDensityMap;
};

const formatWindowDensity = (densities: ExecutionWindowDensityMap): string => {
  const values = Array.from(densities.values());
  const total = values.reduce((acc, value) => acc + value, 0);
  return `${values.length} windows · avg ${(values.length === 0 ? 0 : total / values.length).toFixed(3)}`;
};

export const CadenceExecutionConsole: FC<CadenceExecutionConsoleProps> = ({
  candidates,
  selectedCandidate,
  signalDensity,
  topConstraintSignals,
  planDensityById,
}) => {
  const metrics = useMemo(() => {
    const maxRevision = candidates.reduce((acc, candidate) => Math.max(acc, candidate.revision), 0);
    const constraintSum = topConstraintSignals.reduce((acc, signal) => acc + signal.count, 0);
    const avgConstraint = topConstraintSignals.length === 0 ? 0 : constraintSum / topConstraintSignals.length;
    return {
      candidateCount: candidates.length,
      maxRevision,
      constraintDensity: avgConstraint,
      signalDensity: Number(signalDensity.toFixed(3)),
      planDensity: formatWindowDensity(planDensityById),
    };
  }, [candidates, signalDensity, topConstraintSignals, planDensityById]);

  return (
    <section style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
      <h2>Cadence execution console</h2>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        <article>
          <strong>Candidates</strong>
          <p>{metrics.candidateCount}</p>
        </article>
        <article>
          <strong>Latest revision</strong>
          <p>{metrics.maxRevision}</p>
        </article>
        <article>
          <strong>Signal density</strong>
          <p>{metrics.signalDensity}</p>
        </article>
        <article>
          <strong>Constraint density</strong>
          <p>{metrics.constraintDensity.toFixed(3)}</p>
        </article>
      </section>

      <section style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <p>Plan density profile: {metrics.planDensity}</p>
        <p>Selected candidate: {selectedCandidate?.profile.programRun ?? 'none'}</p>
        <p>
          Constraint signals:{' '}
          {topConstraintSignals.length === 0
            ? 'none'
            : `${topConstraintSignals[0].key} (${topConstraintSignals[0].count})`}
        </p>
      </section>
    </section>
  );
};
