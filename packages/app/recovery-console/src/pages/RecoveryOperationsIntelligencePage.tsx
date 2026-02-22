import { RecoveryOperationsPolicyDashboard } from '../components/RecoveryOperationsPolicyDashboard';
import { RecoveryOperationsRiskPanel } from '../components/RecoveryOperationsRiskPanel';
import { RecoveryOperationsTimeline } from '../components/RecoveryOperationsTimeline';
import { useRecoveryOperationsIntelligence } from '../hooks/useRecoveryOperationsIntelligence';

const signals = [
  {
    id: 'signal-1',
    severity: 5,
    confidence: 0.66,
    source: 'edge',
  },
  {
    id: 'signal-2',
    severity: 8,
    confidence: 0.84,
    source: 'db',
  },
  {
    id: 'signal-3',
    severity: 3,
    confidence: 0.12,
    source: 'queue',
  },
];

export const RecoveryOperationsIntelligencePage = () => {
  const intelligence = useRecoveryOperationsIntelligence();

  return (
    <main className="recovery-operations-intelligence-page">
      <RecoveryOperationsPolicyDashboard
        data={{
          selectedTenant: intelligence.selectedTenant,
          signalCount: intelligence.signalCount,
          portfolios: intelligence.portfolios,
          routeSummary: intelligence.routeSummary,
          timelineSummary: intelligence.timelineSummary,
          busy: intelligence.busy,
          execute: intelligence.execute,
        }}
        onRun={intelligence.execute}
        onClear={intelligence.clear}
      />
      <RecoveryOperationsRiskPanel tenant={intelligence.selectedTenant} signals={signals} />
      <RecoveryOperationsTimeline
        tenant={intelligence.selectedTenant}
        signals={signals.map((signal) => ({
          id: signal.id,
          severity: signal.severity,
          state: signal.severity > 7 ? 'failed' : signal.severity > 4 ? 'running' : 'pending',
        }))}
      />
      <button
        type="button"
        onClick={() => intelligence.ingestSignals(intelligence.selectedTenant, signals)}
      >
        Load sample signals
      </button>
    </main>
  );
};
