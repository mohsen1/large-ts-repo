import { useReadinessCommandCenter } from '../hooks/useReadinessCommandCenter';
import { ReadinessCommandWorkbench } from '../components/ReadinessCommandWorkbench';
import { ReadinessReadModelSummary } from '../components/ReadinessReadModelSummary';
import { useMemo } from 'react';
import type { ReadinessPolicy } from '@domain/recovery-readiness'
const demoPolicy: ReadinessPolicy = {
  policyId: 'policy:readiness-console',
  name: 'Recovery Console Policy',
  constraints: {
    key: 'policy:readiness-console',
    minWindowMinutes: 10,
    maxWindowMinutes: 180,
    minTargetCoveragePct: 0.25,
    forbidParallelity: false,
  },
  allowedRegions: new Set(['us-east-1', 'eu-west-1', 'global']),
  blockedSignalSources: [],
};

export const RecoveryReadinessCommandCenterPage = ({ tenant }: { tenant: string }) => {
  const state = useReadinessCommandCenter({
    tenant,
    planPolicy: demoPolicy,
  });

  const selectedRun = useMemo(() => state.activeRunIds[0], [state.activeRunIds]);

  if (state.loading) {
    return <p>Loading readiness command center...</p>;
  }

  return (
    <main>
      <header>
        <h1>Recovery readiness command center</h1>
        <p>{tenant}</p>
        <p>{`active runs: ${state.activeRunIds.length}`}</p>
        <p>{`stream: ${state.streamId ?? 'none'}`}</p>
        <p>{`warnings: ${state.warningCount}`}</p>
      </header>

      <ReadinessCommandWorkbench models={state.runs} />
      <ReadinessReadModelSummary models={state.runs} selectedRunId={selectedRun} />

      <section>
        <h2>Timeline snapshots</h2>
        <p>{`entries: ${state.timelineLength}`}</p>
      </section>
    </main>
  );
};
