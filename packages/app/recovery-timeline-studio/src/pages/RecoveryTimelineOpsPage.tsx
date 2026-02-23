import { RecoveryTimeline } from '@domain/recovery-timeline';
import { getTimeline, listTimelines } from '../services/recoveryTimelineAdapter';

interface RecoveryTimelineOpsPageProps {
  team: string;
}

export function RecoveryTimelineOpsPage({ team }: RecoveryTimelineOpsPageProps) {
  const seed = listTimelines({ ownerTeam: team, includeSegments: false });
  const active = seed.filter((timeline) => !timeline.events.every((event) => event.state === 'completed'));

  return (
    <div>
      <h2>Operations Snapshot for {team}</h2>
      {active.length === 0 ? (
        <p>No active timelines for this team.</p>
      ) : (
        <ul>
          {active.map((timeline) => {
            const firstIncomplete = timeline.events.find((event) => event.state !== 'completed');
            const totalRisk = timeline.events.reduce((acc, event) => acc + event.riskScore, 0);
            return (
              <li key={timeline.id}>
                <h4>{timeline.name}</h4>
                <p>Next action: {firstIncomplete?.title ?? 'none'}</p>
                <p>Aggregate risk: {Math.round(totalRisk / timeline.events.length)}</p>
              </li>
            );
          })}
        </ul>
      )}
      <section>
        <h3>Resolved Timeline Details</h3>
        {seed.filter((timeline: RecoveryTimeline) => getTimeline(timeline.id)?.events.some((event) => event.state === 'completed')).map((timeline) => (
          <article key={timeline.id}>
            <strong>{timeline.name}</strong>
            <p>{timeline.policyVersion}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
