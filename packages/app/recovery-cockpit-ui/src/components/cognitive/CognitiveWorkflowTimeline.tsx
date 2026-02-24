import { useCallback, useMemo, useState } from 'react';
import { useCognitiveCockpitSignals } from '../../hooks/useCognitiveCockpitSignals';

type Stage = {
  readonly stage: string;
  readonly warningCount: number;
  readonly accepted: boolean;
};

export interface CognitiveWorkflowTimelineProps {
  readonly tenantId: string;
  readonly workspaceId: string;
}

const buildBuckets = (messages: readonly { at: string; message: string }[]): readonly Stage[] => {
  const buckets = new Map<string, { warningCount: number; accepted: boolean }>();
  for (const message of messages) {
    const [rawPlugin, rawStage] = message.message.split(' ');
    const stage = rawStage ?? rawPlugin ?? 'unknown';
    const state = buckets.get(stage) ?? { warningCount: 0, accepted: true };
    if (message.message.includes('warn')) {
      state.warningCount += 1;
    }
    state.accepted = state.accepted && !message.message.includes('fail');
    buckets.set(stage, state);
  }
  return [...buckets.entries()].map(([stage, value]) => ({
    stage,
    warningCount: value.warningCount,
    accepted: value.accepted,
  }));
};

export const CognitiveWorkflowTimeline = ({ tenantId, workspaceId }: CognitiveWorkflowTimelineProps) => {
  const { timeline, loading, refresh } = useCognitiveCockpitSignals({ tenantId, workspaceId });
  const [active, setActive] = useState<Stage[]>([]);

  const buckets = useMemo(() => buildBuckets(timeline), [timeline]);
  const grouped = useMemo(() => buckets.toSorted((left, right) => left.warningCount - right.warningCount), [buckets]);

  const onCollect = useCallback(async () => {
    setActive([]);
    await refresh();
    setActive(grouped);
  }, [refresh, grouped]);

  return (
    <section>
      <header>
        <h2>Cognitive workflow timeline</h2>
        <button type="button" onClick={onCollect} disabled={loading}>
          {loading ? 'Collecting…' : 'Collect'}
        </button>
      </header>
      <ol>
        {grouped.map((entry) => (
          <li key={entry.stage}>
            <strong>{entry.stage}</strong>
            <span> warnings: {entry.warningCount}</span>
            <em>{entry.accepted ? 'accepted' : 'rejected'}</em>
          </li>
        ))}
      </ol>
      <p>Active stages: {active.length}</p>
    </section>
  );
};
