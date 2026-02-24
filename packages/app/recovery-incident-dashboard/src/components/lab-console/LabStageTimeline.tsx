import type { LabRuntimeEvent } from '@domain/recovery-lab-console-core';

interface StageTimelineProps {
  readonly events: readonly LabRuntimeEvent[];
  readonly selectedPhase?: string | null;
}

const stageNames = ['collect', 'resolve', 'simulate', 'recommend', 'report', 'synthesize', 'audit'] as const;

export const LabStageTimeline = ({ events, selectedPhase }: StageTimelineProps) => {
  const latestByStage = stageNames.map((stage) => ({
    stage,
    event: events.findLast((event) => event.kind !== 'run.complete' && event.stage === stage),
  }));

  return (
    <section style={{ display: 'grid', gap: '0.65rem' }}>
      <h3>Lab Stage Timeline</h3>
      <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {latestByStage.map((entry) => {
          const isSelected = entry.stage === selectedPhase;
          const isCompleted = entry.event !== undefined && entry.event.kind === 'plugin.completed';
          const isRunning = entry.event !== undefined && entry.event.kind === 'plugin.started';
          const status =
            isCompleted ? 'done' : isRunning ? 'running' : entry.event ? 'failed' : 'pending';

          return (
            <li key={entry.stage} style={{ color: isSelected ? '#6fe3ff' : '#d5dcef' }}>
              <strong>{entry.stage}</strong>{' '}
              <span
                style={{
                  color: isCompleted ? '#57ff8c' : isRunning ? '#ffde70' : entry.event ? '#ff7a7a' : '#7f8cb0',
                }}
              >
                {status}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
