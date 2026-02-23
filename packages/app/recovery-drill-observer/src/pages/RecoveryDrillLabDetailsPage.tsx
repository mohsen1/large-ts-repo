import { inferInsights } from '@service/recovery-drill-lab-orchestrator';
import { useDrillLabWorkspace } from '../hooks/useDrillLabWorkspace';
import { buildSummaryLine } from '@domain/recovery-drill-lab';

interface Props {
  readonly workspaceId: string;
  readonly scenarioId: string;
}

const SnapshotSummary = ({ snapshot }: { snapshot: Parameters<typeof buildSummaryLine>[0] }) => {
  const summary = buildSummaryLine(snapshot);
  const insight = inferInsights(snapshot);

  return (
    <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>{summary.scenario}</h3>
      <p>{summary.id}</p>
      <p>
        health {summary.healthScore} / risk {summary.riskScore} / status {summary.status}
      </p>
      <p>frames {insight.frames.length} trend {insight.trend}</p>
      <p>suggestion {insight.suggestion}</p>
      <ul>
        {insight.frames.map((frame) => (
          <li key={`${snapshot.id}-${frame.timestamp}`}>
            {frame.timestamp} · {frame.stage} · {frame.completionRatio}% · {frame.riskRatio}%
          </li>
        ))}
      </ul>
    </article>
  );
};

export const RecoveryDrillLabDetailsPage = ({ workspaceId, scenarioId }: Props) => {
  const { snapshots } = useDrillLabWorkspace(workspaceId, scenarioId);

  return (
    <main>
      <h1>Drill detail view</h1>
      <p>
        workspace={workspaceId} scenario={scenarioId}
      </p>
      {snapshots.length === 0 ? <p>No runs yet</p> : snapshots.map((snapshot) => <SnapshotSummary key={snapshot.id} snapshot={snapshot} />)}
    </main>
  );
};
