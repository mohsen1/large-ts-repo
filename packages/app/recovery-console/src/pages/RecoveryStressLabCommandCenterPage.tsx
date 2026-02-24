import { useMemo } from 'react';
import { RecoveryLabConsoleRunner } from '../components/stress-lab/RecoveryLabConsoleRunner';
import { RecoveryLabMetricPanel } from '../components/stress-lab/RecoveryLabMetricPanel';
import { StressLabScenarioBuilder } from '../components/stress-lab/StressLabScenarioBuilder';
import { StressLabTopologyExplorer } from '../components/stress-lab/StressLabTopologyExplorer';
import { type FleetRunResult } from '@service/recovery-stress-lab-orchestrator/stress-lab-fleet';
import { useRecoveryStressLab } from '../hooks/useRecoveryStressLab';

type StressLabTab = 'runner' | 'topology' | 'builder' | 'metrics';

export function RecoveryStressLabCommandCenterPage() {
  const tenantId = 'tenant-omega';
  const zone = 'region-primary';
  const { state } = useRecoveryStressLab(tenantId, zone);

  const fallbackResult = useMemo<FleetRunResult | undefined>(() => {
    if (!state.result) {
      return undefined;
    }

    const metrics: FleetRunResult = state.result;
    return metrics;
  }, [state.result]);

  const renderFallback = (result: FleetRunResult | undefined): string => {
    if (!result) {
      return 'no-result';
    }

    return `run=${result.runId} nodes=${result.summary.nodes} edges=${result.summary.edges}`;
  };

  return (
    <main className="recovery-stress-lab-console">
      <header>
        <h1>Recovery Stress Lab Command Center</h1>
        <p>Tenant: {tenantId}</p>
        <p>Zone: {zone}</p>
      </header>
      <section>
        <h2>Runbook controls</h2>
        <RecoveryLabConsoleRunner tenantId={tenantId} zone={zone} />
      </section>
      <section>
        <h2>Topology</h2>
        <StressLabTopologyExplorer tenantId={tenantId} zone={zone} />
      </section>
      <section>
        <h2>Builder</h2>
        <StressLabScenarioBuilder tenantId={tenantId} zone={zone} />
      </section>
      <section>
        <h2>Metrics</h2>
        <RecoveryLabMetricPanel tenantId={tenantId} zone={zone} />
      </section>
      <section>
        <h2>Latest result</h2>
        <pre>{renderFallback(fallbackResult)}</pre>
      </section>
    </main>
  );
}

export default RecoveryStressLabCommandCenterPage;

const toTabs = (names: readonly StressLabTab[]): Record<StressLabTab, string> =>
  names.reduce((acc, name) => {
    acc[name] = name.toUpperCase();
    return acc;
  }, {} as Record<StressLabTab, string>);

const TAB_LABELS = toTabs(['runner', 'topology', 'builder', 'metrics']);
console.log(TAB_LABELS.runner);
