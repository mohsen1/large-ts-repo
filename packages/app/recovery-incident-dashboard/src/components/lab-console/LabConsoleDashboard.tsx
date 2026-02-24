import { useCallback, useMemo, useState } from 'react';
import { useIncidentLabConsole } from '../../hooks/useIncidentLabConsole';
import { LabEventFeed } from './LabEventFeed';
import { LabPluginRibbon } from './LabPluginRibbon';
import { LabStageTimeline } from './LabStageTimeline';

interface LabConsoleDashboardProps {
  readonly workspaceSignal: string;
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'center',
  marginBottom: '0.8rem',
  flexWrap: 'wrap',
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #29364f',
  borderRadius: '0.7rem',
  padding: '0.8rem',
  background: '#0d1a2f',
};

export const LabConsoleDashboard = ({ workspaceSignal }: LabConsoleDashboardProps) => {
  const { state, events, run, refresh } = useIncidentLabConsole(workspaceSignal);
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [signal, setSignal] = useState(workspaceSignal);

  const diagnostics = useMemo(
    () => ({
      active: state.viewMode === 'running',
      run: state.runId ?? '—',
      entries: state.eventCount,
      ready: state.plugins.length,
      signal: signal || workspaceSignal,
    }),
    [state.viewMode, state.runId, state.eventCount, state.plugins.length, signal, workspaceSignal],
  );

  const onRun = useCallback(async () => {
    await run(signal || workspaceSignal);
  }, [run, signal, workspaceSignal]);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const filteredEvents = events.filter((event) => {
    if (!selectedPlugin) return true;
    if (event.kind === 'run.complete') return event.kind.includes('run');
    return `${event.pluginId}`.includes(selectedPlugin);
  });

  return (
    <section style={{ display: 'grid', gap: '0.9rem' }}>
      <header style={toolbarStyle}>
        <h2>Recovery Lab Console</h2>
        <span>status: {diagnostics.active ? 'active' : 'idle'}</span>
        <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          signal
          <input
            value={signal}
            onChange={(event) => setSignal(event.target.value)}
            style={{ width: '18rem' }}
            placeholder="signal seed"
          />
        </label>
        <button type="button" onClick={onRun} disabled={state.loading}>
          {state.viewMode === 'running' ? 'running...' : 'run scenario'}
        </button>
        <button type="button" onClick={onRefresh}>
          refresh events
        </button>
      </header>

      <section style={cardStyle}>
        <p style={{ margin: '0 0 0.4rem' }}>
          run={diagnostics.run} · entries={diagnostics.entries} · plugins={diagnostics.ready} ·
          seed={diagnostics.signal}
        </p>
        {state.errorMessage ? <p style={{ color: '#ff8a8a' }}>{state.errorMessage}</p> : null}
        <LabPluginRibbon plugins={state.plugins} selected={selectedPlugin} onSelect={setSelectedPlugin} />
      </section>

      <section style={cardStyle}>
        <LabStageTimeline events={events} selectedPhase={selectedPlugin ?? undefined} />
      </section>

      <section style={cardStyle}>
        <LabEventFeed events={filteredEvents} pageSize={8} />
      </section>
    </section>
  );
};
