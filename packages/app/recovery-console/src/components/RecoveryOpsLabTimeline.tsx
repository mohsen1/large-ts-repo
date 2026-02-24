import { useMemo } from 'react';
import type { OrchestrationLab, LabExecution } from '@domain/recovery-ops-orchestration-lab';
import type { OrchestratedLabRun } from '@service/recovery-ops-orchestration-engine/orchestrated-lab';

interface RecoveryOpsLabTimelineProps {
  readonly lab: OrchestrationLab;
  readonly run?: OrchestratedLabRun;
  readonly execution?: LabExecution;
}

interface TimelineItem {
  readonly at: string;
  readonly label: string;
  readonly detail: string;
}

const timelineFromSignals = (lab: OrchestrationLab): TimelineItem[] =>
  lab.signals.map((signal) => ({
    at: signal.createdAt,
    label: signal.tier,
    detail: signal.title,
  }));

const timelineFromRun = (run?: OrchestratedLabRun): readonly TimelineItem[] => {
  if (!run) {
    return [];
  }

  return [
    {
      at: run.runId,
      label: 'run',
      detail: run.envelope.id,
    },
    {
      at: run.envelope.id,
      label: 'envelope',
      detail: `plans=${run.envelope.plans.length} selected=${run.envelope.plans[0]?.id ?? 'none'}`,
    },
  ];
};

const timelineFromExecution = (execution?: LabExecution): readonly TimelineItem[] => {
  if (!execution) {
    return [];
  }

  return [
    {
      at: execution.startedAt,
      label: 'execution',
      detail: `${execution.id}`,
    },
    ...execution.logs.map((log, index) => ({
      at: new Date(Date.now() + index * 250).toISOString(),
      label: 'log',
      detail: log,
    })),
  ];
};

export const RecoveryOpsLabTimeline = ({ lab, run, execution }: RecoveryOpsLabTimelineProps) => {
  const rows = useMemo(() => {
    const merged = [
      ...timelineFromSignals(lab),
      ...timelineFromRun(run),
      ...timelineFromExecution(execution),
    ];
    return merged.toSorted((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  }, [lab, run, execution]);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h4>Run timeline</h4>
      <ul>
        {rows.map((row, index) => (
          <li key={`${row.label}-${row.at}-${index}`}>
            <strong>{row.label}</strong> · {row.at.slice(11, 19)} · {row.detail}
          </li>
        ))}
      </ul>
    </section>
  );
};
