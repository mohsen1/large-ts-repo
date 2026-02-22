import type { StrategyExecutionResult } from '@domain/recovery-orchestration-planning';
import type { StrategyRun } from '@domain/recovery-orchestration-planning';

interface StrategyRunTimelineProps {
  readonly run: StrategyRun;
  readonly results: readonly StrategyExecutionResult[];
  readonly onSelectCommand: (commandId: string) => void;
}

export const StrategyRunTimeline = ({ run, results, onSelectCommand }: StrategyRunTimelineProps) => {
  return (
    <section>
      <h3>Run timeline</h3>
      <p>
        run={run.runId} status={run.status} score={run.score}
      </p>
      <p>targets={run.targetIds.length}</p>
      <div>
        {results.length === 0 ? (
          <p>No command results available</p>
        ) : (
          <ol>
            {results.map((result) => (
              <li key={result.commandId}>
                <button type="button" onClick={() => onSelectCommand(result.commandId)}>
                  {result.commandId} - {result.status}
                </button>
                <span>{result.durationSeconds}s</span>
                <span>{result.outputSummary}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};
