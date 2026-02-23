import { useCallback } from 'react';

import { SignalPrioritiesPanel } from '../components/SignalPrioritiesPanel';
import { SignalPulseGrid } from '../components/SignalPulseGrid';
import { SignalTimeline } from '../components/SignalTimeline';
import { useRecoverySignalIntelligence } from '../hooks/useRecoverySignalIntelligence';

export const RecoverySignalIntelligenceCenterPage = () => {
  const {
    loading,
    error,
    snapshot,
    plan,
    commandsQueued,
    refresh,
    runPlan,
  } = useRecoverySignalIntelligence({ facilityId: 'facility-alpha', tenantId: 'tenant-ops' });

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const handleApprove = useCallback(() => {
    if (!plan) {
      return;
    }
    runPlan('ops-console');
  }, [plan, runPlan]);

  return (
    <main style={{ display: 'grid', gap: 16, padding: 24 }}>
      <header>
        <h1>Recovery Signal Intelligence</h1>
        <p>
          Tenant tenant-ops · facility-alpha · commands queued {commandsQueued}
        </p>
        {error ? <strong style={{ color: '#d84315' }}>{error}</strong> : null}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleRefresh} type="button" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>
      </header>

      <SignalTimeline snapshot={snapshot} compact={loading} />

      {snapshot ? (
        <SignalPrioritiesPanel
          facilityName={snapshot.facilityId}
          priorities={snapshot.priorities}
          onApproveAll={handleApprove}
        />
      ) : null}

      {snapshot ? <SignalPulseGrid pulses={snapshot.pulses} title="Current pulses" /> : null}
      <section>
        <h2>Current plan</h2>
        {plan ? (
          <pre style={{ background: '#eceff1', padding: 12, borderRadius: 8 }}>
            {JSON.stringify(plan, null, 2)}
          </pre>
        ) : (
          <p>No plan available yet</p>
        )}
      </section>
    </main>
  );
};
