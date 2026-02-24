import { useMemo } from 'react';
import { PolicyLabWorkspaceState } from '../hooks/usePolicyLabWorkspace';

interface PolicyLabWorkspaceProps {
  state: PolicyLabWorkspaceState;
  onRefresh: () => Promise<void>;
  onToggleTemplate: (templateId: string) => void;
  onRunDry: () => Promise<void>;
  onRunLive: () => Promise<void>;
  onSetSearch: (query: string) => void;
  onClearSelection: () => void;
}

const metricRows = (state: PolicyLabWorkspaceState): readonly string[] =>
  state.metrics.map((metric) => `${metric.title}: ${metric.value}`);

export const PolicyLabWorkspace = ({
  state,
  onRefresh,
  onToggleTemplate,
  onRunDry,
  onRunLive,
  onSetSearch,
  onClearSelection,
}: PolicyLabWorkspaceProps) => {
  const rows = useMemo(
    () => state.templates.map((template) => ({
      template,
      selected: state.selectedTemplates.includes(template),
    })),
    [state.templates, state.selectedTemplates],
  );

  const selectedCount = rows.filter((entry) => entry.selected).length;
  const hasRunTarget = selectedCount > 0 && !state.isLoading;

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>Policy Lab Workspace</strong>
        <button type="button" onClick={() => onRefresh()}>
          Refresh
        </button>
        <button type="button" onClick={() => onSetSearch('')}>
          Reset Search
        </button>
      </header>

      <p>
        Orchestrator: <strong>{state.orchestratorId}</strong> &middot; Template matches: {state.templates.length} &middot; Selected:{' '}
        {selectedCount} &middot; Mode: {state.runMode}
      </p>

      <label>
        Filter templates
        <input
          value={state.templates.length ? '' : ''}
          onChange={(event) => onSetSearch(event.target.value)}
          placeholder="Search by template id"
        />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!hasRunTarget} onClick={onRunDry}>
          Run Dry
        </button>
        <button type="button" disabled={!hasRunTarget} onClick={onRunLive}>
          Run Live
        </button>
        <button type="button" onClick={onClearSelection}>
          Clear
        </button>
      </div>

      <ul>
        {rows.map((item) => (
          <li key={item.template}>
            <label>
              <input
                type="checkbox"
                checked={item.selected}
                onChange={() => onToggleTemplate(item.template)}
              />
              {item.template}
            </label>
          </li>
        ))}
      </ul>

      <article>
        <h4>Metric rows</h4>
        <ul>
          {metricRows(state).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </article>

      <p>{state.error ?? 'no error'}</p>
    </section>
  );
};
