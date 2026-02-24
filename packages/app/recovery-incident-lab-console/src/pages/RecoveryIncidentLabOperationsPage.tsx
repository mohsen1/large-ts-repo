import { type ChangeEvent, type FormEvent, type ReactElement, useMemo, useState } from 'react';
import { RecoveryLabOperationsPanel } from '../components/RecoveryLabOperationsPanel';
import { RecoveryLabSignalsInspector } from '../components/RecoveryLabSignalsInspector';
import { useRecoveryLabOperations } from '../hooks/useRecoveryLabOperations';
import { type IncidentLabSignal, type IncidentLabPlan } from '@domain/recovery-incident-lab-core';

interface TagControl {
  readonly label: string;
  readonly enabled: boolean;
}

const DEFAULT_TAGS: readonly TagControl[] = [
  { label: 'risk', enabled: true },
  { label: 'coverage', enabled: true },
  { label: 'supply', enabled: false },
];

interface PageHeaderProps {
  readonly canRun: boolean;
  readonly canReset: boolean;
  readonly onReset: () => void;
}

const PageHeader = ({ canRun, canReset, onReset }: PageHeaderProps): ReactElement => (
  <header className="recovery-incident-lab-operations__header">
    <h1>Recovery Incident Lab Operations</h1>
    <p>
      status controls:
      <strong> {canRun ? ' ready' : ' blocked'}</strong>
    </p>
    <button type="button" disabled={!canReset} onClick={onReset}>
      reset local state
    </button>
  </header>
);

const buildSignalIndex = (signals: readonly IncidentLabSignal[]) =>
  signals.reduce<Record<string, number>>((acc, signal) => {
    acc[signal.kind] = (acc[signal.kind] ?? 0) + 1;
    return acc;
  }, {});

const buildSignalsFromState = (
  signals: ReturnType<typeof useRecoveryLabOperations>['telemetrySignals'],
  run?: ReturnType<typeof useRecoveryLabOperations>['state']['run'],
): readonly IncidentLabSignal[] => {
  if (signals.length > 0) {
    return signals.map((telemetryEvent) => ({
      kind: telemetryEvent.kind,
      node: String(telemetryEvent.id),
      value: 1,
      at: telemetryEvent.createdAt,
    }));
  }

  if (!run) {
    return [];
  }

  return run.results.map<IncidentLabSignal>((entry, index) => ({
    kind: index % 2 === 0 ? 'capacity' : 'latency',
    node: String(entry.stepId),
    value: entry.logs.length + index,
    at: entry.startAt,
  }));
};

export const RecoveryIncidentLabOperationsPage = (): ReactElement => {
  const [selectedTags, setSelectedTags] = useState<TagControl[]>(() => [...DEFAULT_TAGS]);
  const {
    launch,
    reset,
    statusText,
    logs,
    summary,
    surfaceSummary,
    validate,
    config,
    telemetrySignals,
    envelopes,
    state,
  } = useRecoveryLabOperations();

  const signals = useMemo<readonly IncidentLabSignal[]>(
    () => buildSignalsFromState(telemetrySignals, state.run),
    [telemetrySignals, state.run],
  );

  const selectedPlan = useMemo<IncidentLabPlan | undefined>(() => state.output?.plan, [state.output]);
  const signalCounts = useMemo(() => buildSignalIndex(signals), [signals]);

  const actions = useMemo(
    () => [
      { label: 'Open surface', href: '#surface' },
      { label: 'Recompute', href: '#recompute' },
      { label: `Envelope ${envelopes.length}`, href: '#envelopes' },
    ],
    [envelopes.length],
  );

  const canRun = validate() === 'valid' && statusText !== 'running';

  const onTagsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = event.currentTarget;
    setSelectedTags((current) =>
      current.map((tag) =>
        tag.label === value
          ? {
              ...tag,
              enabled: checked,
            }
          : tag,
      ),
    );
  };

  const onLaunch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void launch();
  };

  return (
    <main className="recovery-incident-lab-operations-page">
      <PageHeader canRun={canRun} canReset={statusText !== 'running'} onReset={reset} />
      <section>
        <h2>Run context</h2>
        <p>{summary}</p>
        <p>{statusText}</p>
        <p>config throughput={config.targetThroughput} jitter={config.jitterPercent}%</p>
      </section>
      <form onSubmit={onLaunch}>
        <fieldset>
          <legend>Active tags</legend>
          {selectedTags.map((tag) => (
            <label key={tag.label}>
              <input type="checkbox" value={tag.label} checked={tag.enabled} onChange={onTagsChange} />
              {tag.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={!canRun}>
          launch simulation
        </button>
      </form>
      <RecoveryLabOperationsPanel
        output={state.output}
        summary={summary}
        statusText={statusText}
        onRefresh={() => void launch()}
        onReset={reset}
        isRunning={statusText === 'running'}
        logs={logs.map((entry) => `${entry.action}: ${entry.details}`)}
        actions={actions}
      />
      <RecoveryLabSignalsInspector
        title="Live signal inspector"
        signals={signals}
        plan={selectedPlan}
        onRefresh={() => void launch()}
      />
      <section id="surface">
        <h2>Surface summary</h2>
        <ul>
          {surfaceSummary.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Signal kind counts</h2>
        <ul>
          {Object.entries(signalCounts).map(([signalKind, count]) => (
            <li key={signalKind}>
              {signalKind}: {count}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
