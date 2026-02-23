import { useMemo, type ReactElement } from 'react';
import type { ContinuityReadinessEnvelope } from '@domain/recovery-continuity-readiness';
import { buildSimulationCoverage, simulateRun, summarizeSimulation } from '@domain/recovery-continuity-readiness';

interface Props {
  readonly envelope: ContinuityReadinessEnvelope | null;
}

export const ContinuityReadinessRunbook = ({ envelope }: Props): ReactElement => {
  const summary = useMemo(() => {
    if (!envelope) return 'No envelope loaded';
    const firstCoverage = envelope.coverage[0];
    if (!firstCoverage) {
      return 'No coverage entry';
    }
    if (!envelope.run) {
      return 'No active run available';
    }

    const sim = simulateRun(envelope.run, buildSimulationCoverage(firstCoverage));
    return summarizeSimulation(sim);
  }, [envelope]);

  const signals = envelope?.surface.signals ?? [];
  const steps = envelope?.run ? envelope.surface.plans[0]?.runbook ?? [] : [];

  return (
    <section>
      <h3>Continuity runbook</h3>
      <p>{summary}</p>
      <p>{`Signal count: ${signals.length}`}</p>
      <div>
        {steps.length === 0 ? <p>No steps available</p> : null}
        {steps.map((step, index) => (
          <div key={step.id} style={{ marginBottom: 8 }}>
            <strong>{`${index + 1}. ${step.title}`}</strong>
            <p>{`owner=${step.owner} duration=${step.expectedDurationMinutes}m`}</p>
            <code>{step.command}</code>
          </div>
        ))}
      </div>
    </section>
  );
};
