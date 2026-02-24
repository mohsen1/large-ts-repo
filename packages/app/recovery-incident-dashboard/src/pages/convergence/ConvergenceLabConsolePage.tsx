import { useMemo, useState } from 'react';
import { ConvergencePlanList } from '../../components/convergence/ConvergencePlanList';
import { ConvergenceRunControls } from '../../components/convergence/ConvergenceRunControls';
import { ConvergenceTimeline } from '../../components/convergence/ConvergenceTimeline';
import { ConvergenceWorkspaceSummary } from '../../components/convergence/ConvergenceWorkspaceSummary';
import { useConvergenceLab } from '../../hooks/convergence/useConvergenceLab';
import type { ConvergencePlanId } from '@domain/recovery-ops-orchestration-lab';

export const ConvergenceLabConsolePage = () => {
  const {
    workspace,
    status,
    summary,
    runEvents,
    error,
    workspaceId,
    runSimulation,
    reset,
    reload,
  } = useConvergenceLab();

  const [selectedPlanId, setSelectedPlanId] = useState<ConvergencePlanId | undefined>(undefined);

  const selected = useMemo(() => {
    if (!selectedPlanId || !workspace) {
      return undefined;
    }
    return workspace.plans.find((plan) => plan.id === selectedPlanId);
  }, [selectedPlanId, workspace]);

  if (!workspace) {
    return <p>Loading workspace…</p>;
  }

  return (
    <main style={{ display: 'grid', gap: 16, padding: 16 }}>
      <header>
        <h1>Convergence Lab Console</h1>
        <p>
          workspace={workspaceId} | status={status}
        </p>
        <p>{summary}</p>
      </header>

      <ConvergenceWorkspaceSummary workspace={workspace} onRefresh={reload} isBusy={status !== 'idle'} />

      <ConvergenceRunControls status={status} onRun={runSimulation} onReset={reset} />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1.1fr 1fr' }}>
        <ConvergencePlanList
          plans={workspace.plans}
          selectedPlanId={selectedPlanId}
          onSelect={setSelectedPlanId}
        />
        <ConvergenceTimeline events={runEvents} />
      </div>

      {error ? <p style={{ color: '#ff6b6b' }}>Error: {error}</p> : null}
      {selected ? <pre style={{ padding: 12, background: '#0f172a', borderRadius: 8 }}>{JSON.stringify(selected, null, 2)}</pre> : null}
    </main>
  );
};
