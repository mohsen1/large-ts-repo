import { useState } from 'react';
import { useRecoveryTimelineDashboard } from '../hooks/useRecoveryTimelineDashboard';
import { useTimelineFilters } from '../hooks/useTimelineFilters';
import { TimelineBoard } from '../components/TimelineBoard';
import { TimelineDetailDrawer } from '../components/TimelineDetailDrawer';
import { MetricRibbon } from '../components/MetricRibbon';
import { RecoveryTimeline } from '@domain/recovery-timeline';

interface RecoveryTimelineWorkspacePageProps {
  seedTimelines: RecoveryTimeline[];
}

export function RecoveryTimelineWorkspacePage({ seedTimelines }: RecoveryTimelineWorkspacePageProps) {
  const {
    selectedTimeline,
    filtered,
    forecastTimeline,
    runAction,
    setFilter,
    refresh,
  } = useRecoveryTimelineDashboard(seedTimelines);

  const filterState = useTimelineFilters();
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  return (
    <main>
      <header>
        <h1>Recovery Timeline Studio</h1>
        <p>Build and orchestrate deterministic recovery timelines across multiple services.</p>
      </header>

      <section>
        <label>
          Search
          <input
            value={filterState.query}
            onChange={(event) => {
              setFilter(event.currentTarget.value);
              filterState.setQuery(event.currentTarget.value);
            }}
          />
        </label>
        <label>
          Owner Team
          <input
            value={filterState.ownerTeam}
            onChange={(event) => filterState.setOwnerTeam(event.currentTarget.value)}
          />
        </label>
        <button type="button" onClick={refresh}>Refresh</button>
        <button type="button" onClick={runAction}>Advance Timeline</button>
      </section>

      <article>
        <TimelineBoard
          events={selectedTimeline?.events ?? []}
          selectedId={selectedEvent}
          onSelect={setSelectedEvent}
        />
        <TimelineDetailDrawer event={selectedTimeline?.events.find((item) => item.id === selectedEvent)} />
      </article>

      <MetricRibbon timeline={selectedTimeline} />

      <section>
        <h3>Forecast Snapshot</h3>
        {forecastTimeline ? (
          <pre>{JSON.stringify(forecastTimeline, null, 2)}</pre>
        ) : (
          <p>No forecast available. Select a timeline to run simulation.</p>
        )}
      </section>

      <section>
        <h3>Filtered Timelines ({filtered.length})</h3>
        <ul>
          {filtered.map((timeline) => (
            <li key={timeline.id}>
              {timeline.name} - {timeline.events.length} event(s)
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
