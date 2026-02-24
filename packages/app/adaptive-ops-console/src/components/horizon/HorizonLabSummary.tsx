import type { PluginStage } from '@domain/recovery-horizon-engine';

interface HorizonLabSummaryProps {
  readonly tenantId: string;
  readonly signalCount?: number;
  readonly planCount?: number;
  readonly selected: readonly PluginStage[];
  readonly lastRun?: {
    readonly at: number;
    readonly run: string;
    readonly signalCount: number;
    readonly stages: readonly PluginStage[];
  };
  readonly timelines: readonly { readonly stage: PluginStage; readonly count: number }[];
}

export const HorizonLabSummary = ({ tenantId, signalCount, planCount, selected, lastRun, timelines }: HorizonLabSummaryProps) => {
  const topStage = [...timelines].sort((left, right) => right.count - left.count)[0];

  return (
    <section className="horizon-lab-summary">
      <h3>Summary</h3>
      <p>Tenant: {tenantId}</p>
      <p>Selected stages: {selected.join(', ') || 'none'}</p>
      <p>Total signals: {signalCount ?? 0}</p>
      <p>Total plans: {planCount ?? 0}</p>
      {topStage ? (
        <p>
          Busiest stage: {topStage.stage} ({topStage.count})
        </p>
      ) : (
        <p>Busiest stage: unavailable</p>
      )}

      <h4>Latest Run</h4>
      {lastRun ? (
        <ul>
          <li>{new Date(lastRun.at).toISOString()}</li>
          <li>{lastRun.run}</li>
          <li>{lastRun.signalCount} signals</li>
          <li>{lastRun.stages.join(', ')}</li>
        </ul>
      ) : (
        <p>No runs yet.</p>
      )}

      <h4>Timeline counts</h4>
      <ul>
        {timelines.map((entry) => (
          <li key={entry.stage}>
            {entry.stage}: {entry.count}
          </li>
        ))}
      </ul>
    </section>
  );
};
