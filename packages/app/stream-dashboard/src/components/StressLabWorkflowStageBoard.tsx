import { Fragment, useMemo } from 'react';
import { type AdvancedWorkflowRunResult, summarizeAdvancedRun } from '../services/stressLabAdvancedWorkflow';

export interface StageBoardEntry {
  readonly label: string;
  readonly route: string;
  readonly durationMs: number;
  readonly status: 'ok' | 'warn' | 'error';
}

export interface StressLabWorkflowStageBoardProps {
  readonly title: string;
  readonly entries: readonly StageBoardEntry[];
}

const deriveStatus = (entry: StageBoardEntry): string =>
  entry.status === 'ok' ? '✅' : entry.status === 'warn' ? '⚠️' : '⛔';

export const StressLabWorkflowStageBoard = ({ title, entries }: StressLabWorkflowStageBoardProps) => {
  const totalDuration = useMemo(
    () => entries.reduce((acc, entry) => acc + entry.durationMs, 0),
    [entries],
  );
  return (
    <section>
      <h2>{title}</h2>
      <div>
        <strong>Total duration: {totalDuration}ms</strong>
      </div>
      <ul>
        {entries.map((entry, index) => {
          const statusIcon = deriveStatus(entry);
          return (
            <li key={`${entry.label}-${index}`}>
              {statusIcon} {entry.label} ({entry.route}) {entry.durationMs}ms
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export const buildStageBoardEntries = (result: AdvancedWorkflowRunResult): readonly StageBoardEntry[] =>
  result.result.stages.map((entry) => ({
    label: `${entry.stage}`,
    route: entry.route,
    durationMs: entry.elapsedMs,
    status: entry.elapsedMs > 50 ? 'warn' : 'ok',
  }));

export const buildStageBoardSummary = (
  results: readonly { readonly runId: string; readonly stages: readonly StageBoardEntry[] }[],
) => (
  <section>
    {results.map((result) => (
      <article key={result.runId}>
        <h3>{result.runId}</h3>
        <p>Stages: {result.stages.length}</p>
      </article>
    ))}
  </section>
);

export const StressLabWorkflowDigest = ({ result }: { readonly result: AdvancedWorkflowRunResult }) => {
  const summary = summarizeAdvancedRun(result);
  const topSignalIds = summarizeAdvancedRun(result).topSignalIds;
  return (
    <section>
      <p>
        runId: {summary.runId} | source: {String(summary.source)} | traces: {summary.traceCount}
      </p>
      <p>Top signals: {topSignalIds.join(', ') || 'none'}</p>
    </section>
  );
};

export const StressLabWorkflowStageList = ({ board }: { readonly board: ReturnType<typeof buildStageBoardEntries> }) => {
  return (
    <div>
      {board.map((entry, index) => (
        <Fragment key={`${entry.label}-${index}`}>
          <p>
            {entry.label} :: {entry.route}
          </p>
        </Fragment>
      ))}
    </div>
  );
};
