import { useCallback } from 'react';
import { RecoveryTimeline } from '@domain/recovery-timeline';
import type { ReactElement } from 'react';
import { useTimelineLabWorkspace } from '../hooks/useTimelineLabWorkspace';
import { TimelineLabWorkspaceHeader } from '../components/TimelineLabWorkspaceHeader';
import { TimelinePolicyRail } from '../components/TimelinePolicyRail';
import { TimelinePluginGrid } from '../components/TimelinePluginGrid';

interface RecoveryTimelineLabWorkspacePageProps {
  seedTimelines: RecoveryTimeline[];
}

export function RecoveryTimelineLabWorkspacePage({ seedTimelines }: RecoveryTimelineLabWorkspacePageProps): ReactElement {
  const {
    state,
    records,
    pluginSummaries,
    runAction,
    setOwnerTeam,
    setQuery,
    selectTimeline,
    selected,
    preview,
    refresh,
  } = useTimelineLabWorkspace(seedTimelines);

  const timeline = selected;
  const policySteps = records.find((record) => record.selectedTimeline?.id === state.selectedTimelineId)?.plan.steps ?? [];
  const riskWindow = records.find((record) => record.selectedTimeline?.id === state.selectedTimelineId)?.plan.riskWindow ?? [0, 0];

  const activeEvents = timeline?.events.filter((event) => event.state === 'running' || event.state === 'queued').length ?? 0;
  const completedEvents = timeline?.events.filter((event) => event.state === 'completed').length ?? 0;

  const onRun = useCallback(
    async (action: 'advance' | 'simulate' | 'reopen') => {
      const outcome = await runAction(action);
      return outcome;
    },
    [runAction],
  );

  return (
    <main>
      <TimelineLabWorkspaceHeader
        timelineName={timeline?.name ?? 'Timeline Lab'}
        ownerTeam={state.ownerTeam}
        activeEvents={activeEvents}
        completedEvents={completedEvents}
        onRefresh={refresh}
      />

      <section>
        <label>
          Owner Team
          <input value={state.ownerTeam} onChange={(event) => setOwnerTeam(event.currentTarget.value)} />
        </label>
        <label>
          Query
          <input value={state.query} onChange={(event) => setQuery(event.currentTarget.value)} />
        </label>
      </section>

      <section>
        <button type="button" onClick={() => onRun('simulate')}>
          Simulate
        </button>
        <button type="button" onClick={() => onRun('advance')}>
          Advance
        </button>
        <button type="button" onClick={() => onRun('reopen')}>
          Reopen
        </button>
      </section>

      <section>
        <TimelinePolicyRail timelineId={timeline?.id ?? 'unknown'} steps={policySteps} riskWindow={riskWindow} />
      </section>

      <section>
        <TimelinePluginGrid
          timelines={records.map((record) => record.selectedTimeline).filter((entry): entry is RecoveryTimeline => Boolean(entry))}
          selectedId={state.selectedTimelineId}
          onSelectTimeline={(id) => selectTimeline(id)}
          onPreview={(id) => preview(id)}
        />
      </section>

      <section>
        <h4>Plugin Snapshot</h4>
        <ul>
          {pluginSummaries.map((summary) => (
            <li key={`${summary.timelineId}-${summary.planId}`}>
              {summary.timelineId} {summary.steps} steps
              <small>{summary.readyHint}</small>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
