import type { OrchestrationLab } from '@domain/recovery-ops-orchestration-lab';
import { bucketizeSignals, summarizeCatalog, computeSignalTrends, summarizeLab } from '@domain/recovery-ops-orchestration-lab';

interface LabSignalDashboardProps {
  readonly lab: OrchestrationLab;
  readonly className?: string;
}

export const LabSignalDashboard = ({ lab, className }: LabSignalDashboardProps) => {
  const catalog = bucketizeSignals(lab.signals);
  const summary = summarizeLab(
    lab,
    [],
    lab.plans[0],
  );
  const catalogLabel = summarizeCatalog(catalog);
  const trends = computeSignalTrends([lab, lab]).map(
    (trend) => `${trend.signalId}:${trend.direction}(${trend.averageDelta.toFixed(2)})`,
  );

  return (
    <section className={className}>
      <h3>Signals</h3>
      <p>{`signals=${summary.totalSignals} critical=${summary.criticalSignals} planDensity=${summary.planDensity.toFixed(3)}`}</p>
      <p>{catalogLabel}</p>
      <div>
        <h4>Signal distribution</h4>
        <ul>
          <li>{`signal: ${catalog.byTier.signal.count}`}</li>
          <li>{`warning: ${catalog.byTier.warning.count}`}</li>
          <li>{`critical: ${catalog.byTier.critical.count}`}</li>
        </ul>
      </div>
      <h4>Recent trend</h4>
      <ul>
        {trends.slice(0, 6).map((trend) => (
          <li key={trend}>{trend}</li>
        ))}
      </ul>
      <ul>
        {catalog.criticalTop.map((signal) => (
          <li key={signal.id}>{`${signal.title} (${signal.tier})`}</li>
        ))}
      </ul>
    </section>
  );
};
