import { type ReactElement, useMemo, useState } from 'react';
import { useRecoveryIncidentLabAdvancedOrchestration } from '../hooks/useRecoveryIncidentLabAdvancedOrchestration';
import { RecoveryLabAdvancedDeck } from '../components/RecoveryLabAdvancedDeck';
import { RecoveryLabSignalTicker } from '../components/RecoveryLabSignalTicker';
import { RecoveryLabAdvancedTelemetry } from '../components/RecoveryLabAdvancedTelemetry';
import { AdvancedLabSignalHistoryChart } from '../components/AdvancedLabSignalHistoryChart';

type RenderMode = 'rows' | 'telemetry' | 'signatures';

export const RecoveryIncidentLabAdvancedStudioPage = (): ReactElement => {
  const { state, runAdvanced, setMode, setTelemetry, addSeed, reset } = useRecoveryIncidentLabAdvancedOrchestration();
  const [mode, setLocalMode] = useState<RenderMode>('rows');

  const frames = useMemo(
    () =>
      state.rows.flatMap((row) =>
        row.pluginTrail.map((plugin) => ({
          at: row.runId,
          signature: `${row.scenarioId}:${plugin.tags.join('.')}`,
        })),
      ),
    [state.rows],
  );

  const signatures = useMemo(() => state.signatures, [state.signatures]);
  const output = useMemo(() => state.output.join('\n'), [state.output]);
  const errors = useMemo(() => state.errors.join('; '), [state.errors]);
  const pluginRows = useMemo(() => state.pluginOutputs, [state.pluginOutputs]);

  return (
    <main className="recovery-incident-lab-advanced-studio-page">
      <header>
        <h1>Advanced Recovery Incident Studio</h1>
        <p>seed size: {state.scenarioCount}</p>
      </header>
      <section className="studio-controls">
        <button
          type="button"
          onClick={() => {
            void runAdvanced();
          }}
          disabled={state.stage === 'running'}
        >
          run
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('adaptive');
          }}
        >
          adaptive
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('strict');
          }}
        >
          strict
        </button>
        <label>
          telemetry
          <input
            type="checkbox"
            checked={state.includeTelemetry}
            onChange={(event) => {
              setTelemetry(event.currentTarget.checked);
            }}
          />
        </label>
        <button type="button" onClick={addSeed}>
          add seed
        </button>
        <button type="button" onClick={reset}>
          reset
        </button>
      </section>
      <RecoveryLabSignalTicker frames={frames} maxFrames={8} />
      <section className="studio-mode">
        <button
          type="button"
          onClick={() => {
            setLocalMode((current) => (current === 'rows' ? 'telemetry' : current === 'telemetry' ? 'signatures' : 'rows'));
          }}
        >
          cycle: {mode}
        </button>
      </section>
      <RecoveryLabAdvancedDeck
        rows={state.rows}
        signatures={signatures}
        onSeedAdd={addSeed}
        onReset={reset}
        onOutputSelect={(output) => {
          void output;
        }}
      />
      {mode === 'telemetry' ? <RecoveryLabAdvancedTelemetry series={state.outputSeries} rows={state.rows} /> : null}
      {mode === 'signatures' ? <p>{output}</p> : null}
      <AdvancedLabSignalHistoryChart
        frames={state.rows.flatMap((row) =>
          row.pluginTrail.flatMap((item) =>
            item.tags.map((tag) => ({
              at: row.runId,
              kind: 'capacity',
              value: item.tags.length + row.pluginTrail.length,
            })),
          ),
        )}
      />
      <footer>
        <p>status: {state.stage}</p>
        <p>jitter: {state.jitterPercent}</p>
        <p>plugins: {pluginRows.length}</p>
        {errors ? <p>errors: {errors}</p> : null}
      </footer>
    </main>
  );
};
