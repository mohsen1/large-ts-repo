import { useMemo } from 'react';
import type { CommandRunbook, RecoverySimulationResult, OrchestrationPlan } from '@domain/recovery-stress-lab';

export interface StressLabReadinessPanelProps {
  readonly tenantId: string;
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly runbooks: readonly CommandRunbook[];
  readonly onRefresh?: () => void;
}

interface HealthMetric {
  readonly label: string;
  readonly value: number;
}

const buildHealth = (
  plan: OrchestrationPlan | null,
  simulation: RecoverySimulationResult | null,
  runbooks: readonly CommandRunbook[],
): HealthMetric[] => {
  const risk = simulation?.riskScore ?? 0;
  const sla = simulation?.slaCompliance ?? 0;
  const signalCount = simulation?.ticks.length ?? 0;
  const runbookCoverage = runbooks.length > 0 ? runbooks.length : 1;
  const windowCoverage = (plan?.schedule.length ?? 0) / runbookCoverage;
  const health = Math.max(0, 100 - risk * 100);
  const readiness = Math.max(0, Math.min(100, (sla * 100) + windowCoverage));
  return [
    { label: 'risk', value: Number(risk.toFixed(3)) },
    { label: 'sla', value: Number((sla * 100).toFixed(2)) },
    { label: 'signals', value: signalCount },
    { label: 'windows', value: plan?.schedule.length ?? 0 },
    { label: 'runbooks', value: runbookCoverage },
    { label: 'health', value: Number(health.toFixed(2)) },
    { label: 'readiness', value: Number(readiness.toFixed(2)) },
    { label: 'coverage', value: Number(windowCoverage.toFixed(2)) },
  ];
};

const riskTone = (value: number) => {
  if (value >= 70) return 'good';
  if (value >= 50) return 'warning';
  return 'critical';
};

export const StressLabReadinessPanel = ({
  tenantId,
  plan,
  simulation,
  runbooks,
  onRefresh,
}: StressLabReadinessPanelProps) => {
  const health = useMemo(() => buildHealth(plan, simulation, runbooks), [plan, simulation, runbooks]);
  const hasPlan = Boolean(plan);
  const hasSimulation = Boolean(simulation);

  return (
    <section>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Readiness panel</h3>
        <button type="button" onClick={onRefresh}>refresh</button>
      </header>
      <p>tenant: {tenantId}</p>
      <p>plan={hasPlan ? 'ready' : 'missing'} simulation={hasSimulation ? 'ready' : 'missing'}</p>
      <dl>
        {health.map((item) => (
          <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <dt>{item.label}</dt>
            <dd style={{ fontWeight: 'bold', color: item.label === 'risk' ? riskTone(100 - item.value) : undefined }}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <div>
        {runbooks.slice(0, 5).map((runbook) => (
          <div key={runbook.id} style={{ display: 'grid', gap: '0.2rem' }}>
            <strong>{runbook.name}</strong>
            <span>steps={runbook.steps.length}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
