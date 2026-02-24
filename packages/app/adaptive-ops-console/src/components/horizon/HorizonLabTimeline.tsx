import type { PluginStage } from '@domain/recovery-horizon-engine';
import type { LabSignalWindow } from '@service/recovery-horizon-orchestrator';

interface HorizonLabTimelineProps {
  readonly tenantId: string;
  readonly windows: readonly LabSignalWindow[];
  readonly selectedStages: readonly PluginStage[];
}

export const HorizonLabTimeline = ({ tenantId, windows, selectedStages }: HorizonLabTimelineProps) => {
  const selectedSet = new Set(selectedStages);

  const rows = windows
    .filter((window) => selectedSet.has(window.stage))
    .map((window) => ({
      window,
      count: window.records.length,
      cursor: window.records.at(-1)?.payload.id ?? 'n/a',
    }));

  if (!rows.length) {
    return <section className="horizon-lab-timeline">No timeline data for {tenantId}</section>;
  }

  return (
    <section className="horizon-lab-timeline">
      <h3>Timeline ({tenantId})</h3>
      <ol>
        {rows.map((entry) => {
          const stage = entry.window.stage;
          return (
            <li key={stage}>
              <h4>{stage}</h4>
              <p>cursor: {entry.cursor}</p>
              <p>records: {entry.count}</p>
              <ul>
                {entry.window.records.slice(0, 5).map((record) => (
                  <li key={`${record.payload.id}-${record.at}`}>
                    <span>{record.payload.id}</span>
                    <span>{new Date(record.at).toISOString()}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
