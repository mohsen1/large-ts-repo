import { useMemo } from 'react';
import { createTenantId } from '@domain/recovery-stress-lab';
import { useStressLabCampaignWorkspace } from '../hooks/useStressLabCampaignWorkspace';
import { RecoveryStressLabCampaignDeck } from '../components/RecoveryStressLabCampaignDeck';
import { RecoveryStressLabCampaignSignalBoard } from '../components/RecoveryStressLabCampaignSignalBoard';
import { RecoveryStressLabCampaignTimeline } from '../components/RecoveryStressLabCampaignTimeline';

export const RecoveryStressLabCampaignStudioPage = () => {
  const tenantId = createTenantId('campaign-studio-tenant');
  const workspace = useStressLabCampaignWorkspace(tenantId);

  const timelineItems = useMemo(
    () =>
      workspace.workspace.phases.map((phase, index) => ({
        phase,
        at: new Date(Date.now() + index * 1500).toISOString(),
      })),
    [workspace.workspace.phases],
  );

  const catalog = workspace.catalog.map((entry) => ({
    value: entry,
    label: entry,
  }));

  return (
    <main>
      <h1>Recovery Stress Lab Campaign Studio</h1>

      <section>
        <h2>Catalog</h2>
        <select
          value={workspace.selectedCampaign}
          onChange={(event) => workspace.setSelectedCampaign(event.target.value)}
        >
          {catalog.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>

        <button type="button" onClick={() => void workspace.buildPlan(workspace.selectedCampaign)} disabled={workspace.isRunning}>
          Build Plan
        </button>
        <button type="button" onClick={() => void workspace.runSimulation()} disabled={workspace.isRunning}>
          Run Simulation
        </button>
        <button type="button" onClick={workspace.seedSignalsFromQuery}>
          Apply Query Signals
        </button>
      </section>

      <RecoveryStressLabCampaignDeck
        workspace={workspace.workspace}
        isRunning={workspace.isRunning}
        selectedCampaign={workspace.selectedCampaign}
        onSelectCampaign={workspace.setSelectedCampaign}
      />

      <RecoveryStressLabCampaignSignalBoard
        campaign={workspace.selectedCampaign}
        signals={workspace.signalRows}
        route={workspace.route}
        onQuery={(next) => workspace.setFilters({ ...workspace.filters, query: next })}
      />

      <RecoveryStressLabCampaignTimeline items={timelineItems} isRunning={workspace.isRunning} />
    </main>
  );
};
