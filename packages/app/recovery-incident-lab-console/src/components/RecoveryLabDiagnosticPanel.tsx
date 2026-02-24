import { type ReactElement } from 'react';
import type { IncidentLabSignal, IncidentLabPlan, IncidentLabRun } from '@domain/recovery-incident-lab-core';

interface Props {
  readonly scenarioId: string;
  readonly signals: readonly IncidentLabSignal[];
  readonly plan?: IncidentLabPlan;
  readonly run?: IncidentLabRun;
  readonly onExport: () => void;
}

const signalGroups = (signals: readonly IncidentLabSignal[]): Record<IncidentLabSignal['kind'], readonly IncidentLabSignal[]> =>
  signals.reduce<Record<IncidentLabSignal['kind'], IncidentLabSignal[]>>(
    (acc, signal) => {
      acc[signal.kind] = [...(acc[signal.kind] ?? []), signal];
      return acc;
    },
    { capacity: [], latency: [], integrity: [], dependency: [] },
  );

const bucketSummary = (signals: readonly IncidentLabSignal[]): string => {
  if (signals.length === 0) {
    return 'none';
  }
  const latest = signals[signals.length - 1];
  const average = signals.reduce((acc, signal) => acc + signal.value, 0) / signals.length;
  return `${signals.length} latest=${latest.at} avg=${average.toFixed(2)} last=${latest.node}`;
};

export const RecoveryLabDiagnosticPanel = ({ scenarioId, signals, plan, run, onExport }: Props): ReactElement => {
  const grouped = signalGroups(signals);
  const rows = (Object.entries(grouped) as [IncidentLabSignal['kind'], IncidentLabSignal[]][]).map(([kind, values]) => ({
    kind,
    summary: bucketSummary(values),
  }));

  return (
    <section className="recovery-lab-diagnostic-panel">
      <header>
        <h2>Diagnostics</h2>
        <p>scenario={scenarioId}</p>
      </header>
      <button type="button" onClick={onExport}>
        Export diagnostics
      </button>
      <div className="diagnostic-grid">
        {rows.map((row) => (
          <article key={row.kind}>
            <h3>{row.kind}</h3>
            <p>{row.summary}</p>
          </article>
        ))}
      </div>
      <div className="diagnostic-meta">
        <p>plan: {plan ? plan.id : 'none'}</p>
        <p>run: {run ? run.runId : 'none'}</p>
        <p>state: {run ? run.state : 'n/a'}</p>
      </div>
    </section>
  );
};
