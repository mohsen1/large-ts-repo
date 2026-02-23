import { useRecoveryOpsOrchestrationLabDashboard } from '../hooks/useRecoveryOpsOrchestrationLabDashboard';
import { LabSignalDashboard } from '../components/recovery-ops-orchestration-lab/LabSignalDashboard';
import { PlanReadinessPanel } from '../components/recovery-ops-orchestration-lab/PlanReadinessPanel';
import { RunHealthPanel } from '../components/recovery-ops-orchestration-lab/RunHealthPanel';
import type { OrchestrationLabPageProps } from '../types/recoveryOpsOrchestrationLab';
import type { OrchestrationPolicy } from '@domain/recovery-ops-orchestration-lab';
import type { LabRunRecord, OrchestrationLabRecord, StoreSummary } from '@data/recovery-ops-orchestration-lab-store';

export function RecoveryOpsOrchestrationLabDashboardPage({ lab, onSelect, onRun }: OrchestrationLabPageProps) {
  const { state, refresh, runPlan, selectPlan, diagnostics } = useRecoveryOpsOrchestrationLabDashboard(lab);

  const summaryPlaceholder = {
    totalLabs: 1,
    totalRuns: 0,
    selectedPlanCount: state.selectedPlanId ? 1 : 0,
    lastUpdated: new Date().toISOString(),
  } satisfies StoreSummary;

  const policy: OrchestrationPolicy = {
    id: 'dashboard-policy' as OrchestrationPolicy['id'],
    tenantId: lab.tenantId,
    maxParallelSteps: 10,
    minConfidence: 0.3,
    allowedTiers: ['signal', 'warning', 'critical'],
    minWindowMinutes: 8,
    timeoutMinutes: 180,
  };

  const runHistory: readonly LabRunRecord[] = [];
  const records: readonly OrchestrationLabRecord[] = [];

  return (
    <main>
      <h1>Recovery Orchestration Lab Dashboard</h1>
      <p>{state.summaryLine}</p>
      <p>{state.forecastLine}</p>
      <LabSignalDashboard lab={lab} />
      <PlanReadinessPanel
        lab={lab}
        policy={policy}
        onSelect={(planId) => {
          void selectPlan(planId);
          onSelect?.(planId);
        }}
      />
      <RunHealthPanel snapshot={{
        labs: [lab],
        windows: [],
        runs: runHistory,
        summary: summaryPlaceholder,
        auditTrail: [],
      }}
      runs={runHistory}
      summary={summaryPlaceholder}
      />
      <section>
        <div>{`windows=${diagnostics.timelineWindows}`}</div>
        <div>{`snapshots=${diagnostics.totalSnapshots}`}</div>
        <button
          type="button"
          onClick={() => {
            void refresh();
          }}
        >
          refresh
        </button>
        <button
          type="button"
          onClick={() => {
            void runPlan();
            onRun?.(state.selectedPlanId);
          }}
        >
          run selected
        </button>
      </section>
      {state.errors.length > 0 ? <p>{state.errors.join('; ')}</p> : null}
    </main>
  );
}
