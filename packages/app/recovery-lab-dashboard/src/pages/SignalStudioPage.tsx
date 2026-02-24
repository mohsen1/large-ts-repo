import { useMemo, useState } from 'react';
import { useSignalStudio } from '../hooks/useSignalStudio';
import { StudioDashboard } from '../components/StudioDashboard';
import { SignalTape } from '../components/SignalTape';
import { StudioRunbookPanel } from '../components/StudioRunbookPanel';

interface SignalStudioPageProps {
  readonly tenant: string;
  readonly workspace: string;
}

export const SignalStudioPage = ({ tenant, workspace }: SignalStudioPageProps) => {
  const {
    loading,
    error,
    selectedScenario,
    scenarioNames,
    workspace: studioWorkspace,
    run,
    setScenario,
  } = useSignalStudio({ tenant, workspace });

  const [runId, setRunId] = useState('');

  const selectedLabel = useMemo(() => `${tenant}/${workspace}/${selectedScenario}`, [tenant, workspace, selectedScenario]);

  const submit = async () => {
    await run();
    setRunId(`${tenant}:${workspace}:${selectedScenario}`);
  };

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <h1>Signal studio</h1>
      <section>
        <label htmlFor="scenario">Scenario</label>
        <select
          id="scenario"
          value={selectedScenario}
          onChange={(event) => {
            setScenario(event.currentTarget.value);
          }}
          disabled={loading}
        >
          {scenarioNames.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <button type="button" onClick={submit} disabled={loading}>
          {loading ? 'running...' : 'run'}
        </button>
      </section>

      <section>
        <p>selected={selectedLabel}</p>
        <p>state={studioWorkspace.running ? 'running' : 'idle'}</p>
        {error ? <p style={{ color: 'red' }}>{error}</p> : null}
      </section>

      <StudioDashboard tenant={tenant} runId={runId} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SignalTape events={studioWorkspace.traces} lane="studio.trace" enabled={studioWorkspace.running} />
        <StudioRunbookPanel
          runId={selectedLabel}
          traces={studioWorkspace.traces}
          onReplay={() => {
            void submit();
          }}
        />
      </div>
    </main>
  );
};
