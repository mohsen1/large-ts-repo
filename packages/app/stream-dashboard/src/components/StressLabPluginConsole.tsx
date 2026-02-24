interface PluginConsoleProps {
  readonly ready: boolean;
  readonly stage: 'input' | 'shape' | 'plan' | 'simulate' | 'recommend';
  readonly summary: string | null;
  readonly summaryCount: number;
  readonly entries: readonly string[];
  readonly loading: boolean;
}

export const StressLabPluginConsole = ({
  ready,
  stage,
  summary,
  summaryCount,
  entries,
  loading,
}: PluginConsoleProps) => {
  const stateClass = ready ? 'online' : 'cold';
  const severity = ready ? 'green' : 'orange';

  return (
    <article>
      <h3>Plugin Registry</h3>
      <p>
        State: <strong>{stateClass}</strong> ({stage})
      </p>
      <p>Summary count: {summaryCount}</p>
      <p>Summary: {summary ?? 'N/A'}</p>
      <p>Link: {loading ? 'syncing' : 'complete'}</p>
      <div style={{ color: severity }}>
        <ul>
          {entries.slice(0, 14).map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </div>
    </article>
  );
};
