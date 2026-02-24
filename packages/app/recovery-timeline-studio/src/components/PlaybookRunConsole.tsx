import { useMemo } from 'react';

interface PlaybookRunConsoleProps {
  readonly runIds: readonly string[];
  readonly selectedRunId: string | null;
  readonly diagnostics: readonly string[];
  readonly isLoading: boolean;
  readonly onSelectRun: (runId: string) => void;
  readonly onRefresh: () => void;
  readonly onInspect: () => Promise<void>;
}

const highlight = (value: string): string => value.startsWith('warning') ? 'warn' : value.startsWith('error') ? 'error' : 'info';

const chunk = (text: string, width = 120): readonly string[] => {
  const output: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const part = text.slice(cursor, cursor + width);
    output.push(part);
    cursor += width;
  }
  return output;
};

export function PlaybookRunConsole({
  runIds,
  selectedRunId,
  diagnostics,
  isLoading,
  onSelectRun,
  onRefresh,
  onInspect,
}: PlaybookRunConsoleProps) {
  const sorted = useMemo(() => [...runIds].toSorted((left, right) => right.localeCompare(left)), [runIds]);
  const summary = diagnostics.length;

  return (
    <section>
      <header>
        <h3>Run Console</h3>
        <div>
          <span>Runs: {runIds.length}</span>
          <span>Diagnostics: {summary}</span>
          {isLoading ? <strong>running...</strong> : null}
        </div>
      </header>

      <div>
        <button type="button" onClick={onRefresh}>refresh</button>
        <button type="button" onClick={() => void onInspect()} disabled={selectedRunId === null}>
          inspect selected
        </button>
      </div>

      <section>
        <h4>Recent Runs</h4>
        {sorted.length === 0 ? (
          <p>No runs yet.</p>
        ) : (
          <ul>
            {sorted.map((runId) => {
              const isSelected = selectedRunId === runId;
              return (
                <li key={runId}>
                  <button type="button" className={isSelected ? 'selected' : ''} onClick={() => onSelectRun(runId)}>
                    {runId}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h4>Diagnostics Stream</h4>
        <ul>
          {diagnostics.flatMap((entry) => {
            const lines = chunk(entry);
            return lines.map((line, index) => (
              <li key={`${entry}-${index}`} className={`diag-${highlight(line)}`}>
                {line}
              </li>
            ));
          })}
        </ul>
      </section>
    </section>
  );
}
