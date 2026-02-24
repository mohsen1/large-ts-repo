import { useMemo, type ReactElement } from 'react';
import {
  useRecoveryLabIntelligenceWorkspace,
} from '../hooks/useRecoveryLabIntelligenceWorkspace';
import { IntelligenceStrategyBoard } from '../components/IntelligenceStrategyBoard';
import { IntelligencePolicyTimeline } from '../components/IntelligencePolicyTimeline';
import { IntelligenceSignalStrip } from '../components/IntelligenceSignalStrip';
import { useRecoveryLabAdaptiveOrchestration } from '../hooks/useRecoveryLabAdaptiveOrchestration';

export const RecoveryLabIntelligenceStudioPage = (): ReactElement => {
  const {
    state,
    setScenario,
    setWorkspace,
    setLane,
    setMode,
    setSeed,
    runOnce,
    runBatch,
    loadPlan,
    reset,
    signalSummary,
    latestScore,
    scoreTrend,
    canRun,
  } = useRecoveryLabIntelligenceWorkspace();

  const { state: adaptiveState } = useRecoveryLabAdaptiveOrchestration();
  const planSummary = state.run ? `plan ${state.run.plan.title} (${state.run.plan.lanes.join(', ')})` : undefined;
  const scoreSeries = useMemo(() => scoreTrend.join(' | '), [scoreTrend]);
  const laneOptions = ['forecast', 'resilience', 'containment', 'recovery', 'assurance'] as const;
  const modeOptions = ['simulate', 'analyze', 'stress', 'plan', 'synthesize'] as const;

  return (
    <main className="recovery-lab-intelligence-studio-page">
      <h1>Recovery Lab Intelligence Studio</h1>
      <section className="recovery-lab-intelligence-studio-page__controls">
        <label>
          Workspace
          <input value={state.workspace} onChange={(event) => setWorkspace(event.target.value)} />
        </label>
        <label>
          Scenario
          <input value={state.scenario} onChange={(event) => setScenario(event.target.value)} />
        </label>
        <label>
          Seed
          <input value={state.seedSeed} onChange={(event) => setSeed(event.target.value)} />
        </label>
        <label>
          Lane
          <select value={state.lane} onChange={(event) => setLane(event.target.value as never)}>
            {laneOptions.map((lane) => (
              <option value={lane} key={lane}>
                {lane}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mode
          <select value={state.mode} onChange={(event) => setMode(event.target.value as never)}>
            {modeOptions.map((mode) => (
              <option value={mode} key={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={loadPlan} disabled={state.loading}>
          Load plan
        </button>
        <button type="button" onClick={runOnce} disabled={!canRun || state.loading}>
          Run once
        </button>
        <button type="button" onClick={runBatch} disabled={state.loading}>
          Run batch
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </section>
      <section className="recovery-lab-intelligence-studio-page__panels">
        <IntelligenceStrategyBoard
          plan={state.plan}
          tuple={state.tuple}
          loading={state.loading}
          onRefresh={loadPlan}
        />
        <article>
          <h2>Latest score: {latestScore.toFixed(4)}</h2>
          <p>{planSummary ?? 'no plan output yet'}</p>
          <p>Adaptive summary: {adaptiveState.summary}</p>
          <p>Score trend: {scoreSeries}</p>
        </article>
      </section>
      <section className="recovery-lab-intelligence-studio-page__events">
        <IntelligencePolicyTimeline events={state.run?.events ?? []} />
        <IntelligenceSignalStrip events={signalSummary} selectedSeverity="warn" />
      </section>
      <section className="recovery-lab-intelligence-studio-page__history">
        <h2>Batch history</h2>
        <ul>
          {state.batchRuns.map((run) => (
            <li key={run.runId}>
              {run.runId}: {run.result.score.toFixed(4)} ({run.metrics.eventCount} events)
            </li>
          ))}
        </ul>
      </section>
      {state.error && <p role="alert">Error: {state.error}</p>}
    </main>
  );
};
