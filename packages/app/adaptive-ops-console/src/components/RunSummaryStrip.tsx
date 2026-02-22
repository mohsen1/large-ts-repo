import { UiRunSummary } from '../types';

interface RunSummaryStripProps {
  summaries: readonly UiRunSummary[];
}

export const RunSummaryStrip = ({ summaries }: RunSummaryStripProps) => {
  return (
    <section className="run-summary-strip">
      <h3>Recent Runs</h3>
      <ul>
        {summaries.length === 0 ? (
          <li>No runs yet.</li>
        ) : (
          summaries.map((summary) => (
            <li key={summary.runId ?? `${summary.tenantId}-${summary.status}`}>
              <strong>{summary.tenantId}</strong>
              <span>status={summary.status}</span>
              <span>decisions={summary.decisionCount}</span>
              <span>top={summary.topActionType ?? 'none'}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
};
