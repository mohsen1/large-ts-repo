import { useMemo, useState } from 'react';
import { getTimeline, listTimelines } from '../../../services/recoveryTimelineAdapter';
import { RecoveryTimelineConductorPage } from './RecoveryTimelineConductorPage';
import { useTimelineConductorCandidates } from '../hooks/useTimelineConductorWorkspace';
import { TimelineConductorPolicyPanel } from '../components/TimelineConductorPolicyPanel';
import { createConductorId, type ConductorMode } from '@domain/recovery-timeline-orchestration';
import { toConductorMetric } from '../types';
import type { RecoveryTimeline } from '@domain/recovery-timeline';

export function RecoveryTimelineConductorOpsPage() {
  const [mode, setMode] = useState<ConductorMode>('simulate');
  const candidates = useTimelineConductorCandidates(mode);
  const timeline = useMemo(() => {
    const list = listTimelines({ ownerTeam: 'Ops Team', includeSegments: true });
    return (list.length > 0 ? list[0] : getTimeline('ops-default')) as RecoveryTimeline;
  }, []);

  const metrics = useMemo(() => (timeline ? toConductorMetric(timeline) : undefined), [timeline]);

  return (
    <main>
      <h1>Conductor Operations</h1>
      <label>
        Mode
        <select value={mode} onChange={(event) => setMode(event.currentTarget.value as ConductorMode)}>
          <option value="observe">observe</option>
          <option value="simulate">simulate</option>
          <option value="stabilize">stabilize</option>
        </select>
      </label>

      <section>
        <h2>Candidate timelines</h2>
        <p>{candidates.candidateCount} candidate timelines</p>
        <ul>
          {candidates.candidates.map((entry: RecoveryTimeline) => (
            <li key={entry.id}>{entry.name}</li>
          ))}
        </ul>
      </section>

      <section>
        {timeline && metrics ? (
          <TimelineConductorPolicyPanel
            output={{
              id: createConductorId(mode),
              timelineId: timeline.id,
              mode,
              riskProfile: { low: 1, medium: 2, high: 3, critical: 4 },
              timelineWindow: [],
              nextSteps: ['init'],
              snapshot: {
                timelineId: timeline.id,
                source: 'ops',
                measuredAt: new Date(),
                confidence: 0.75,
                expectedReadyAt: new Date(),
                actualReadyAt: undefined,
                note: `${timeline.id}::${mode}`,
              },
            }}
            pending={candidates.candidateCount}
          />
        ) : null}
      </section>

      <RecoveryTimelineConductorPage />
    </main>
  );
}
