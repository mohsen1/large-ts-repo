import { useState } from 'react';
import {
  TimelinePhase,
  type RecoveryTimeline,
} from '@domain/recovery-timeline';
import { useTimelineSignalCadence } from '../hooks/useTimelineSignalCadence';
import { TimelineSignalHeatmap } from '../components/TimelineSignalHeatmap';
import { TimelineSignalList } from '../components/TimelineSignalList';

const phaseOptions = ['prepare', 'mitigate', 'restore', 'verify', 'stabilize'] as const;
const riskOptions = ['low', 'medium', 'high', 'critical'] as const;
const sortOptions = ['risk', 'volume', 'timeline'] as const;

interface RecoveryTimelineSignalOpsPageProps {
  readonly seedTimelines: RecoveryTimeline[];
}

const nextRisk = (value: (typeof riskOptions)[number]): (typeof riskOptions)[number] => {
  if (value === 'low') {
    return 'medium';
  }
  if (value === 'medium') {
    return 'high';
  }
  if (value === 'high') {
    return 'critical';
  }
  return 'critical';
};

export function RecoveryTimelineSignalOpsPage({ seedTimelines }: RecoveryTimelineSignalOpsPageProps) {
  const cadence = useTimelineSignalCadence(seedTimelines);
  const [signature, setSignature] = useState('');
  const selectedTimeline = seedTimelines.find((timeline) => timeline.id === cadence.activeTimelineId);
  const selected = selectedTimeline ? {
    id: selectedTimeline.id,
    name: selectedTimeline.name,
  } : {
    id: seedTimelines[0]?.id ?? null,
    name: seedTimelines[0]?.name ?? 'No timeline',
  };

  return (
    <main>
      <header>
        <h1>Recovery Timeline Signal Ops</h1>
        <p>Profile signal classes and phase-level risk envelopes for recovery timelines.</p>
      </header>

      <form>
        <label>
          Filter Phases
          <select
            multiple
            value={cadence.phaseFilter}
            onChange={(event) => {
              const selected = Array.from(event.currentTarget.selectedOptions).map((entry) => entry.value).filter((value) =>
                phaseOptions.includes(value as TimelinePhase),
              );
              cadence.setPhaseFilter(selected as TimelinePhase[]);
            }}
          >
            {phaseOptions.map((phase) => (
              <option key={phase} value={phase}>
                {phase}
              </option>
            ))}
          </select>
        </label>

        <label>
          Minimum Risk
          <select
            value={cadence.minimumRisk}
            onChange={(event) => {
              const value = event.currentTarget.value as (typeof riskOptions)[number];
              cadence.setMinimumRisk(value);
            }}
          >
            {riskOptions.map((risk) => (
              <option key={risk} value={risk}>
                {risk}
              </option>
            ))}
          </select>
        </label>

        <label>
          Sort
          <select
            value={cadence.sortMode}
            onChange={(event) => {
              const value = event.currentTarget.value as (typeof sortOptions)[number];
              cadence.setSortMode(value);
            }}
          >
            {sortOptions.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>

        <label>
          Signature
          <input
            value={signature}
            onChange={(event) => {
              setSignature(event.currentTarget.value);
            }}
            placeholder="timelineId::risk"
          />
          <button
            type="button"
            onClick={() => {
              const tokens = signature.split('::');
              const next = tokens[1] as (typeof riskOptions)[number];
              if (tokens[0]) {
                cadence.setActiveTimelineId(tokens[0]);
              }
              if (riskOptions.includes(next)) {
                cadence.setMinimumRisk(nextRisk(next));
              }
            }}
          >
            Apply Signature
          </button>
        </label>
      </form>

      <section>
        <h3>Selected Timeline: {selected.name}</h3>
      </section>

      <TimelineSignalHeatmap
        timelineName={selected.name}
        cadence={cadence.cadence}
      />

      <TimelineSignalList
        events={cadence.events}
        activeTimelineId={cadence.activeTimelineId}
        onSelect={cadence.setActiveTimelineId}
      />

      <section>
        <h3>Timeline Ranking</h3>
        <ul>
          {cadence.rankedTimelines.map((row) => (
            <li key={row.timelineId}>
              <span>{row.timelineId}</span>
              <span>{row.riskBand}</span>
              <span>{row.events}</span>
              <button type="button" onClick={() => cadence.setActiveTimelineId(row.timelineId)}>
                Inspect
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Signatures ({cadence.signatures.length})</h3>
        <pre>{cadence.signatures.slice(0, 16).join('\n')}</pre>
      </section>
    </main>
  );
}
