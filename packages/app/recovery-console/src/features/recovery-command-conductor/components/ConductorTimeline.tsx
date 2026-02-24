import type { ConductorPhaseEntry } from '../types';

interface ConductorTimelineProps {
  readonly timeline: readonly ConductorPhaseEntry[];
}

const statusLabel = (status: ConductorPhaseEntry['status']): string => {
  switch (status) {
    case 'plugin-start':
      return 'start';
    case 'plugin-progress':
      return 'progress';
    case 'plugin-complete':
      return 'complete';
    case 'plugin-failed':
      return 'failed';
    default:
      return 'event';
  }
}

const groupByPhase = (timeline: readonly ConductorPhaseEntry[]) => {
  const output = new Map<string, ConductorPhaseEntry[]>();
  for (const entry of timeline) {
    const bucket = output.get(entry.phase) ?? [];
    bucket.push(entry);
    output.set(entry.phase, bucket);
  }
  return output;
};

export const ConductorTimeline = ({ timeline }: ConductorTimelineProps) => {
  const grouped = groupByPhase(timeline);
  return (
    <section>
      <h2>Execution timeline</h2>
      {Array.from(grouped.entries()).map(([phase, entries]) => (
        <article key={phase}>
          <h3>{phase}</h3>
          <ol>
            {entries.map((entry, index) => (
              <li key={`${entry.pluginName}-${index}`}>
                {`[${statusLabel(entry.status)}] ${entry.pluginName}: ${entry.details}`}
              </li>
            ))}
          </ol>
        </article>
      ))}
      <p>{`total events: ${timeline.length}`}</p>
    </section>
  );
};
