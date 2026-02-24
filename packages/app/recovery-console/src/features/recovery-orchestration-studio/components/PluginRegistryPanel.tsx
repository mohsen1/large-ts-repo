import type { EngineTick } from '@service/recovery-orchestration-studio-engine';

interface PluginRegistryPanelProps {
  readonly ticks: readonly EngineTick[];
}

const classify = (status: EngineTick['status']): string => status.toUpperCase();

export const PluginRegistryPanel = ({ ticks }: PluginRegistryPanelProps) => {
  const total = ticks.length;
  const running = ticks.filter((tick) => tick.status === 'running').length;
  const finished = ticks.filter((tick) => tick.status === 'finished').length;
  const blocked = ticks.filter((tick) => tick.status === 'blocked').length;
  const failed = ticks.filter((tick) => tick.status === 'failed').length;
  return (
    <section>
      <h2>Plugin Registry</h2>
      <ul>
        <li>Total events: {total}</li>
        <li>Running: {running}</li>
        <li>Finished: {finished}</li>
        <li>Blocked: {blocked}</li>
        <li>Failed: {failed}</li>
      </ul>
      <ol>
        {ticks.slice(0, 15).map((tick) => (
          <li key={`${tick.at}-${tick.pluginId}`}>
            <strong>{tick.phase}</strong> · {tick.pluginId} · {classify(tick.status)}
            <div>{tick.metadata?.[tick.phase] ? String(tick.metadata[tick.phase]) : JSON.stringify(tick.metadata)}</div>
          </li>
        ))}
      </ol>
    </section>
  );
};
