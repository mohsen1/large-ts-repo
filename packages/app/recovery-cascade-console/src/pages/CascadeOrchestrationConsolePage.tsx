import { useState } from 'react';
import { CascadeOverviewPanel } from '../components/CascadeOverviewPanel.js';
import { PluginRegistryPanel } from '../components/PluginRegistryPanel.js';
import { ScenarioComposerPanel } from '../components/ScenarioComposerPanel.js';
import { useCascadeOrchestration } from '../hooks/useCascadeOrchestration.js';
import type { ScenarioDraft } from '../types.js';
import { bootstrapBlueprint } from '../services/bootstrap.js';
import type { BlueprintManifest } from '@domain/recovery-cascade-orchestration';

export interface CascadeOrchestrationConsolePageProps {
  readonly tenantId: string;
}

const createDraft = (blueprint: BlueprintManifest): ScenarioDraft<typeof blueprint> => ({
  blueprint,
  notes: 'Initialize staged simulation',
});

export const CascadeOrchestrationConsolePage = ({ tenantId }: CascadeOrchestrationConsolePageProps) => {
  const [selectedPlugins, setSelectedPlugins] = useState(new Set<string>());
  const [draft, setDraft] = useState(() => createDraft(bootstrapBlueprint));

  const {
    summary,
    execute,
    events,
    pluginRows,
    pluginCount,
    eventCount,
    stageNames,
    pluginFilters,
    stageTraces,
    executing,
    setSummary,
  } = useCascadeOrchestration({ tenantId });

  const workspace = {
    blueprint: draft.blueprint,
    summary,
    pluginCatalog: pluginRows.map((row) => row.name),
    selected: pluginRows.map((row) => row.name),
  };

  const enrichedSummary = {
    ...summary,
    pluginCount,
    eventCount,
    stageNames,
  };

  return (
    <main>
      <header>
        <h1>Recovery Cascade Console</h1>
        <p>Tenant: {tenantId} · Events: {events.length}</p>
      </header>
      <CascadeOverviewPanel summary={enrichedSummary} />
      <ScenarioComposerPanel
        draft={draft}
        workspace={workspace}
        onPatch={(next) => setDraft({ ...draft, ...next })}
      />
      <PluginRegistryPanel
        plugins={pluginRows.map((row) => row.name)}
        selected={selectedPlugins}
        onSelect={(ids) => setSelectedPlugins(new Set(ids))}
      />
      <section>
        <h3>Run Controls</h3>
        <button type="button" onClick={() => setSummary((current) => ({ ...current, state: 'idle' }))}>
          Reset state
        </button>
        <button type="button" onClick={execute} disabled={executing}>
          {executing ? 'Running' : 'Run Default Cascade'}
        </button>
      </section>
      <section>
        <h3>Filtered Plugins</h3>
        <p>{pluginFilters.length} plugins currently active</p>
      </section>
      <section>
        <h3>Stage Traces</h3>
        <ul>
          {stageTraces.map((trace) => (
            <li key={`${trace.stage}-${trace.events.length}`}>"{trace.stage}" ({trace.events.length} events)</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
