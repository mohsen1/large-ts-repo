import type { EngineTick, EngineResult } from '@service/recovery-orchestration-studio-engine';
interface PolicyTimelineProps {
  readonly result?: EngineResult;
  readonly ticks: readonly EngineTick[];
}

interface TimelineRow {
  readonly index: number;
  readonly phase: EngineTick['phase'];
  readonly plugin: string;
  readonly at: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

const toRows = (ticks: readonly EngineTick[]): readonly TimelineRow[] =>
  ticks.map((tick, index) => ({
    index,
    phase: tick.phase,
    plugin: tick.pluginId,
    at: tick.at,
    metadata: tick.metadata,
  }));

export const PolicyTimeline = ({ result, ticks }: PolicyTimelineProps) => {
  const rows = toRows(ticks);
  const phases = [...new Set(rows.map((row) => row.phase))];
  const nodeCount = result?.ticks.length ?? 0;
  return (
    <section>
      <h2>Policy Timeline</h2>
      <p>{`phases: ${phases.join(', ')}`}</p>
      <p>{`events: ${rows.length}`}</p>
      <p>{`last-phase: ${phases.at(-1) ?? 'none'}`}</p>
      <p>{`total-ticks: ${nodeCount}`}</p>
      <ul>
        {rows.map((row) => (
          <li key={`${row.at}-${row.index}`}>
            {row.phase} → {row.plugin}
            <pre>{JSON.stringify(row.metadata, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </section>
  );
};
