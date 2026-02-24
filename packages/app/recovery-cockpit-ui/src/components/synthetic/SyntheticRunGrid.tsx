import { FC } from 'react';
import {
  type ScenarioResultSet,
  type PlanResult,
} from '@domain/recovery-cockpit-synthetic-lab';

type RunCell = {
  readonly runId: string;
  readonly scenarioId: string;
  readonly digest: string;
  readonly score: number;
  readonly stageCount: number;
};

export type SyntheticRunGridProps = {
  readonly runs: readonly ScenarioResultSet[];
  readonly selectedPlan: string | undefined;
  readonly onReplay: (runId: string) => void;
};

const rankByScore = (runs: readonly ScenarioResultSet[]): readonly ScenarioResultSet[] =>
  [...runs].toSorted((left, right) => right.result.summary.score - left.result.summary.score);

const asCell = (run: ScenarioResultSet): RunCell => {
  const timeline = run.result.timeline;
  const score = Math.max(0, run.result.summary.score);
  return {
    runId: run.result.runId,
    scenarioId: run.request.scenario.id,
    digest: run.result.digest,
    score,
    stageCount: timeline.length,
  };
};

const stageBuckets = (runs: readonly ScenarioResultSet[]): Record<string, number> => {
  return runs.reduce((acc, run) => {
    const bucket = run.result.timeline.length;
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

const digestSignature = (result: PlanResult): string =>
  `${result.digest}-${result.timeline.length}-${result.summary.confidence.toFixed(2)}`;

export const SyntheticRunGrid: FC<SyntheticRunGridProps> = ({ runs, selectedPlan, onReplay }) => {
  const ranked = rankByScore(runs);
  const buckets = stageBuckets(runs);
  const active = ranked.filter((entry) => entry.result.summary.score > 0);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header>
        <h3>Run grid</h3>
        <p>Active: {active.length}</p>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(buckets).map(([bucket, count]) => (
          <span key={bucket} style={{ padding: 6, border: '1px solid #ddd', borderRadius: 8 }}>
            stages {bucket}: {count}
          </span>
        ))}
      </div>

      <section style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Scenario</th>
              <th>Score</th>
              <th>Stages</th>
              <th>Digest</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((run, index) => {
              const cell = asCell(run);
              const highlight = run.request.scenario.id === selectedPlan ? '#eef' : undefined;
              return (
                <tr key={`${run.result.runId}-${index}`} style={{ background: highlight }}>
                  <td>{cell.runId}</td>
                  <td>{cell.scenarioId}</td>
                  <td>{cell.score.toFixed(1)}</td>
                  <td>{cell.stageCount}</td>
                  <td>{digestSignature(run.result)}</td>
                  <td>
                    <button type="button" onClick={() => onReplay(cell.runId)}>
                      Replay
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <aside>
        <h4>Selected scenario digest</h4>
        <p>{selectedPlan ?? 'none'}</p>
      </aside>
    </section>
  );
};
