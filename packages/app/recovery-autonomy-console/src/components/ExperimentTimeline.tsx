import { useMemo } from 'react';
import type { ExperimentPlan, ExperimentPhase } from '@domain/recovery-autonomy-experiment';

interface TimelineProps {
  readonly plan?: ExperimentPlan;
  readonly activePhase?: ExperimentPhase;
}

interface TimelineEntry {
  readonly phase: ExperimentPhase;
  readonly hasNodes: boolean;
  readonly marker: string;
  readonly active: boolean;
}

const DEFAULT_SEQUENCE: readonly ExperimentPhase[] = ['prepare', 'inject', 'observe', 'adapt', 'recover', 'verify'];

export const ExperimentTimeline = ({ plan, activePhase }: TimelineProps) => {
  const timeline = useMemo(() => {
    const sequence = plan?.sequence ?? DEFAULT_SEQUENCE;
    const entries = sequence.map((phase, index) => {
      const entry: TimelineEntry = {
      phase,
      marker: `stage:${phase}:${index}`,
      active: activePhase === phase,
      hasNodes: !!plan?.graph.some((node) => node.phase === phase),
      };
      return entry;
    });

    return entries;
  }, [plan, activePhase]);

  const summary = timeline.filter((entry) => entry.hasNodes).map((entry) => entry.phase).join(' ');

  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <p>Timeline: {summary || 'empty'}</p>
      <ol style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {timeline.map((entry) => (
          <li
            key={entry.marker}
            style={{
              border: entry.active ? '2px solid #2563eb' : '1px solid #cbd5e1',
              borderRadius: 10,
              padding: 8,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{entry.phase}</span>
            <span>{entry.hasNodes ? 'with nodes' : 'empty'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};
