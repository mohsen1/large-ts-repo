import { useMemo } from 'react';

import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import { projectSignalsToSignalMap, activeEventsDigest } from '@data/recovery-readiness-store';
import { buildAdviceMap } from '@service/recovery-readiness-orchestrator';
import { summarizeOrchestratorState, readModelWindowScores } from '@service/recovery-readiness-orchestrator';

interface ReadinessCommandWorkbenchProps {
  readonly models: readonly ReadinessReadModel[];
}

interface HealthCardProps {
  readonly label: string;
  readonly value: string;
}

const HealthCard = ({ label, value }: HealthCardProps) => (
  <article>
    <h4>{label}</h4>
    <strong>{value}</strong>
  </article>
);

export const ReadinessCommandWorkbench = ({ models }: ReadinessCommandWorkbenchProps) => {
  const advice = useMemo(() => buildAdviceMap(models), [models]);
  const state = useMemo(() => summarizeOrchestratorState(models), [models]);
  const scores = useMemo(() => readModelWindowScores(models), [models]);
  const signalMap = useMemo(() => projectSignalsToSignalMap(models), [models]);
  const eventsDigest = useMemo(() => activeEventsDigest(models), [models]);

  const topScore = useMemo(() => [...scores].sort((left, right) => right.score - left.score)[0], [scores]);

  return (
    <section>
      <h3>Readiness command workbench</h3>
      <div>
        <HealthCard label="Active runs" value={state.totalActive.toString()} />
        <HealthCard label="Warnings" value={state.totalWarnings.toString()} />
        <HealthCard label="Top score" value={`${topScore?.score ?? 0}`} />
        <HealthCard label="Avg density" value={state.meanSignalDensity.toFixed(2)} />
        <HealthCard label="Advice level" value={advice.severity} />
      </div>
      <h4>Signal map entries</h4>
      <ul>
        {Object.entries(signalMap)
          .slice(0, 8)
          .map(([entryKey, value]) => (
            <li key={entryKey}>
              {entryKey}: {value}
            </li>
          ))}
      </ul>
      <h4>Recent event digest</h4>
      <pre>{eventsDigest}</pre>
    </section>
  );
};
