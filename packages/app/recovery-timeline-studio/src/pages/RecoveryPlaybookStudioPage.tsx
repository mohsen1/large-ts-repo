import { useState } from 'react';
import { PlaybookTopologyGraph } from '../components/PlaybookTopologyGraph';
import { PlaybookRunConsole } from '../components/PlaybookRunConsole';
import { PlaybookPolicyPanel } from '../components/PlaybookPolicyPanel';
import { usePlaybookPolicyControls } from '../hooks/usePlaybookPolicyControls';
import { usePlaybookStudio } from '../hooks/usePlaybookStudio';

const NODE_PREVIEW = [
  { id: 'node.discover.default', name: 'discover-default', phase: 'discover' as const, tags: ['baseline', 'seed'] },
  { id: 'node.plan.default', name: 'plan-default', phase: 'plan' as const, tags: ['policy', 'graph'] },
  { id: 'node.simulate.default', name: 'simulate-default', phase: 'simulate' as const, tags: ['forecast', 'what-if'] },
  { id: 'node.execute.default', name: 'execute-default', phase: 'execute' as const, tags: ['run', 'action'] },
  { id: 'node.verify.default', name: 'verify-default', phase: 'verify' as const, tags: ['validation'] },
  { id: 'node.finalize.default', name: 'finalize-default', phase: 'finalize' as const, tags: ['finish', 'cleanup'] },
];

export function RecoveryPlaybookStudioPage() {
  const studio = usePlaybookStudio();
  const policy = usePlaybookPolicyControls();
  const [selectedNode, setSelectedNode] = useState<string | null>(NODE_PREVIEW[0]?.id ?? null);

  return (
    <main>
      <header>
        <h1>Recovery Playbook Studio</h1>
        <p>
          Build orchestration plans, inspect traces, and adjust policy controls for tenant-specific recovery scenarios.
        </p>
      </header>

      <section>
        <h2>Catalog</h2>
        <p>
          Workspace: {studio.workspaceId} / Tenant: {studio.tenantId}
        </p>
        <p>
          Catalog entries: {studio.catalogEntries} | seeded entries enabled: {studio.hasCatalogEntries ? 'yes' : 'no'}
        </p>
      </section>

      <div>
        <label>
          Tenant
          <input
            value={studio.tenantId}
            onChange={(event) => studio.selectTenant(event.currentTarget.value)}
          />
        </label>

        <label>
          Workspace
          <input
            value={studio.workspaceId}
            onChange={(event) => studio.selectWorkspace(event.currentTarget.value)}
          />
        </label>

        <button type="button" onClick={() => void studio.runStudio()}>Start Run</button>
        <button type="button" onClick={() => void studio.refresh()}>Refresh Runs</button>
        <button type="button" onClick={() => void studio.inspect()}>Inspect</button>
        <button type="button" onClick={studio.reset}>Reset UI</button>
      </div>

      <section>
        <PlaybookPolicyPanel
          state={policy}
          onChangeRegion={policy.setRegion}
          onChangeTenantPriority={policy.setTenantPriority}
          onChangeRetryLimit={policy.setRetryLimit}
          onToggleFinalization={policy.setIncludeFinalization}
          onTogglePersist={policy.setAutoPersist}
          onReset={policy.reset}
        />
      </section>

      {studio.error ? <p role="alert">Error: {studio.error}</p> : null}

      <section>
        <PlaybookTopologyGraph
          nodes={NODE_PREVIEW}
          selectedNodeId={selectedNode}
          onSelect={setSelectedNode}
        />
      </section>

      <section>
        <PlaybookRunConsole
          runIds={studio.runIds}
          selectedRunId={studio.selectedRunId}
          diagnostics={studio.diagnostics}
          isLoading={studio.isLoading}
          onSelectRun={(runId) => void studio.refresh()}
          onRefresh={() => void studio.refresh()}
          onInspect={() => studio.inspect()}
        />
      </section>
    </main>
  );
}
