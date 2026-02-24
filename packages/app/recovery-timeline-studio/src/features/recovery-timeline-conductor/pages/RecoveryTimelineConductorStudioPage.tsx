import { useMemo } from 'react';
import { RecoveryTimelineConductorPage } from './RecoveryTimelineConductorPage';
import { useTimelineConductorCandidates } from '../hooks/useTimelineConductorWorkspace';
import { TimelineConductorPolicyPanel } from '../components/TimelineConductorPolicyPanel';
import { createConductorId } from '@domain/recovery-timeline-orchestration';

export function RecoveryTimelineConductorStudioPage() {
  const candidates = useTimelineConductorCandidates('observe');
  const hasCandidates = useMemo(() => candidates.candidateCount > 0, [candidates.candidateCount]);

  const syntheticOutput = useMemo(
    () => ({
      id: createConductorId('observe'),
      timelineId: 'timeline-studio',
      mode: 'observe' as const,
      riskProfile: {
        low: 12,
        medium: 14,
        high: 7,
        critical: 1,
      },
      timelineWindow: [0, 1, 2],
      nextSteps: ['safety-check', 'run-checkpoints', 'commit'],
      snapshot: {
        timelineId: 'timeline-studio',
        source: 'studio',
        measuredAt: new Date(),
        confidence: 0.9,
        expectedReadyAt: new Date(),
        actualReadyAt: undefined,
        note: 'studio-mode',
      },
    }),
    [],
  );

  return (
    <main>
      <h1>Conductor Studio</h1>
      <section>
        <p>
          {hasCandidates
            ? `running in studio mode for ${candidates.candidateCount} candidates`
            : 'no candidates available'}
        </p>
      </section>

      <TimelineConductorPolicyPanel
        output={syntheticOutput}
        pending={hasCandidates ? candidates.candidateCount : 0}
      />
      <RecoveryTimelineConductorPage />
    </main>
  );
}
