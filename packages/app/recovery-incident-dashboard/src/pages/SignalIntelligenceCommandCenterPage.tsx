import { useMemo } from 'react';
import { SignalCampaignList } from '../components/signal-intelligence/SignalCampaignList';
import { SignalRunTicker } from '../components/signal-intelligence/SignalRunTicker';
import { useSignalIntelligenceWorkspace } from '../hooks/useSignalIntelligenceWorkspace';

interface PageSnapshot {
  readonly campaignId: string;
  readonly facility: string;
  readonly status: 'queued' | 'active' | 'throttled' | 'completed' | 'cancelled';
}

const fallbackList = (facilities: readonly string[]): PageSnapshot[] =>
  facilities.map((facility, index) => ({
    campaignId: `seed-${facility}-${index}`,
    facility,
    status: index % 2 === 0 ? 'queued' : 'completed',
  }));

export const SignalIntelligenceCommandCenterPage = () => {
  const { report, facilities, onboard, executeCycle, load } = useSignalIntelligenceWorkspace('tenant-omega', 'ops-agent');
  const campaigns = useMemo<PageSnapshot[]>(
    () =>
      fallbackList(facilities).map((item, index) => ({
        ...item,
        status: index % 3 === 0 ? 'active' : index % 3 === 1 ? 'throttled' : item.status,
      })),
    [facilities],
  );

  return (
    <main>
      <h2>Signal Intelligence Command Center</h2>
      <section>
        <p>campaigns: {report.campaignCount}</p>
        <p>active: {report.activeCount}</p>
        <p>completed: {report.completedCount}</p>
      </section>
      {report.errors.map((entry, index) => (
        <p key={`${entry}-${index}`} style={{ color: 'crimson' }}>
          {entry}
        </p>
      ))}
      <SignalRunTicker
        label="orchestrator-cycle"
        frequencySeconds={3}
        isRunning={report.activeCount > 0}
      />
      <SignalCampaignList
        items={campaigns}
        onExecute={(campaignId) => {
          onboard(campaignId.split('-')[1] ?? facilities[0] ?? 'facility-a');
          executeCycle();
        }}
        onRefresh={() => {
          load();
        }}
      />
    </main>
  );
};
