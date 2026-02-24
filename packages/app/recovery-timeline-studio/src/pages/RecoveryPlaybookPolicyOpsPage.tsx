import { useMemo, useState } from 'react';
import { usePlaybookStudio } from '../hooks/usePlaybookStudio';
import { usePlaybookPolicyControls } from '../hooks/usePlaybookPolicyControls';

const STAGE_OPTIONS = ['discover', 'plan', 'simulate', 'execute', 'verify', 'finalize'] as const;

export function RecoveryPlaybookPolicyOpsPage() {
  const studio = usePlaybookStudio();
  const policy = usePlaybookPolicyControls();
  const [selectedStages, setSelectedStages] = useState<readonly typeof STAGE_OPTIONS[number][]>(['discover', 'plan', 'simulate']);

  const summary = useMemo(() => {
    const activeCount = selectedStages.length;
    return {
      activeCount,
      activeStages: [...selectedStages],
      totalWarnings: studio.diagnostics.filter((entry) => entry.includes('warning')).length,
      catalogEntries: studio.catalogEntries,
    };
  }, [selectedStages, studio.diagnostics, studio.catalogEntries]);

  const toggleStage = (stage: typeof STAGE_OPTIONS[number]): void => {
    if (selectedStages.includes(stage)) {
      setSelectedStages(selectedStages.filter((entry) => entry !== stage));
      return;
    }
    setSelectedStages([...selectedStages, stage].toSorted());
  };

  return (
    <main>
      <header>
        <h2>Playbook Policy Operations</h2>
        <p>Tune policy options and inspect selected stage policy envelope.</p>
      </header>

      <section>
        <h3>Policy Surface</h3>
        <div>
          {STAGE_OPTIONS.map((stage) => {
            const active = selectedStages.includes(stage);
            return (
              <label key={stage}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleStage(stage)}
                />
                {stage}
              </label>
            );
          })}
        </div>

        <label>
          Include finalization
          <input
            type="checkbox"
            checked={policy.includeFinalization}
            onChange={(event) => policy.setIncludeFinalization(event.currentTarget.checked)}
          />
        </label>

        <button type="button" onClick={() => studio.runStudio()}>Simulate Selected Stages</button>
      </section>

      <section>
        <h3>Policy Snapshot</h3>
        <dl>
          <dt>Active Stages</dt>
          <dd>{summary.activeStages.join(', ')}</dd>

          <dt>Active Count</dt>
          <dd>{summary.activeCount}</dd>

          <dt>Total Diagnostics</dt>
          <dd>{studio.diagnostics.length}</dd>

          <dt>Warnings</dt>
          <dd>{summary.totalWarnings}</dd>

          <dt>Catalog Size</dt>
          <dd>{summary.catalogEntries}</dd>

          <dt>Auto Persist</dt>
          <dd>{policy.autoPersist ? 'enabled' : 'disabled'}</dd>

          <dt>Tenant Priority</dt>
          <dd>{policy.tenantPriority}</dd>
        </dl>
      </section>

      <section>
        <h3>Recent Diagnostics</h3>
        <pre>{studio.diagnostics.join('\n')}</pre>
      </section>

      <section>
        <h3>Run Status</h3>
        <button type="button" onClick={() => void studio.refresh()}>Refresh Runs</button>
        <button type="button" onClick={() => void studio.inspect()}>Inspect Latest</button>
        <p>Loading: {studio.isLoading ? 'yes' : 'no'}</p>
        <p>Selected workspace: {studio.workspaceId}</p>
      </section>

      <details>
        <summary>Current Workspace Inputs</summary>
        <ul>
          {studio.runIds.slice(0, 20).map((runId) => (
            <li key={runId}>{runId}</li>
          ))}
        </ul>
      </details>
    </main>
  );
}
