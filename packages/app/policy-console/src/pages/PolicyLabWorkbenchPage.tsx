import { useMemo } from 'react';
import { usePolicyLabWorkspace } from '../hooks/usePolicyLabWorkspace';
import { PolicyLabWorkspace } from '../components/PolicyLabWorkspace';
import { PolicyLabCommandPanel } from '../components/PolicyLabCommandPanel';
import { PolicyLabTimeline } from '../components/PolicyLabTimeline';
import { PolicyLabRunDeck } from '../components/PolicyLabRunDeck';

export function PolicyLabWorkbenchPage() {
  const { state, refresh, runSelected, toggleTemplate, setSearch, selectAll, clearSelection } = usePolicyLabWorkspace();

  const summary = useMemo(
    () => ({
      templates: state.templates.length,
      selected: state.selectedTemplates.length,
      mode: state.runMode,
      loading: state.isLoading,
    }),
    [state.templates.length, state.selectedTemplates.length, state.isLoading, state.runMode],
  );

  return (
    <main>
      <h1>Policy Lab Workbench</h1>
      <p>
        Templates: {summary.templates}, selected: {summary.selected}, loading: {summary.loading ? 'yes' : 'no'}
      </p>
      <PolicyLabWorkspace
        state={state}
        onRefresh={() => refresh()}
        onToggleTemplate={toggleTemplate}
        onRunDry={() => runSelected(true)}
        onRunLive={() => runSelected(false)}
        onSetSearch={setSearch}
        onClearSelection={clearSelection}
      />
      <PolicyLabCommandPanel state={state} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <PolicyLabRunDeck state={state} onSelectTemplate={toggleTemplate} />
        <PolicyLabTimeline values={state.telemetry} />
      </div>
      <button type="button" onClick={selectAll}>
        Select all visible
      </button>
    </main>
  );
}
