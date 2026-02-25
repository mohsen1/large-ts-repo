import { useMemo } from 'react';
import type { ScenarioRunSnapshot } from '../../types/scenario-studio';

export interface ScenarioStudioRunInspectorProps {
  readonly runs: readonly ScenarioRunSnapshot[];
  readonly selectedRunId?: string;
}

export interface RunSummary {
  readonly templateCount: number;
  readonly stageCount: number;
  readonly modeCounts: Map<string, number>;
  readonly maxLatency: number;
}

export function summarizeTemplates(input: readonly { templateId: string; stages: readonly unknown[] }[]): {
  readonly templateCount: number;
  readonly stageBuckets: Map<string, number>;
  readonly averageStage: number;
} {
  const averageStage = input.length === 0 ? 0 : input.reduce((sum, template) => sum + template.stages.length, 0) / input.length;
  const stageBuckets = new Map<string, number>();
  for (const template of input) {
    stageBuckets.set(template.templateId, template.stages.length);
  }
  return {
    templateCount: input.length,
    stageBuckets,
    averageStage,
  };
}

export function ScenarioStudioRunInspector({ runs, selectedRunId }: ScenarioStudioRunInspectorProps) {
  const selected = useMemo(() => runs.find((run) => run.runId === selectedRunId), [runs, selectedRunId]);

  const summary = useMemo<RunSummary>(() => {
    const modeCounts = new Map<string, number>();
    for (const run of runs) {
      modeCounts.set(run.mode, (modeCounts.get(run.mode) ?? 0) + 1);
    }

    return {
      templateCount: runs.length,
      stageCount: runs.reduce((sum, run) => sum + run.stageStats.length, 0),
      modeCounts,
      maxLatency: runs.reduce((max, run) => Math.max(max, run.durationMs), 0),
    };
  }, [runs]);

  return (
    <section className="scenario-studio-run-inspector">
      <h3>Run Inspector</h3>
      <dl>
        <div>
          <dt>Runs</dt>
          <dd>{summary.templateCount}</dd>
        </div>
        <div>
          <dt>Total Stage Events</dt>
          <dd>{summary.stageCount}</dd>
        </div>
        <div>
          <dt>Max Latency</dt>
          <dd>{summary.maxLatency}ms</dd>
        </div>
      </dl>
      <h4>Mode histogram</h4>
      <ul>
        {Array.from(summary.modeCounts.entries()).map(([mode, count]) => (
          <li key={mode}>
            {mode}: {count}
          </li>
        ))}
      </ul>
      {selected ? (
        <article>
          <h4>Selected run</h4>
          <p>ID: {selected.runId}</p>
          <p>State: {selected.state}</p>
          <p>Progress: {selected.progress}%</p>
          <p>Duration: {selected.durationMs}ms</p>
          <ul>
            {selected.stageStats.map((entry) => (
              <li key={entry.stageId}>
                {entry.stageId} / {entry.status} / {entry.latencyMs}ms
              </li>
            ))}
          </ul>
        </article>
      ) : (
        <p>select a run to inspect</p>
      )}
    </section>
  );
}

export default ScenarioStudioRunInspector;
