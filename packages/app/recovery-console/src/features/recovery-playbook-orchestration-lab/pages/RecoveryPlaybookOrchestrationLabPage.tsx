import { useMemo, useState } from 'react';
import { PlaybookControlBoard } from '../components/PlaybookControlBoard';
import { PlaybookPolicyImpactPanel } from '../components/PlaybookPolicyImpactPanel';
import { PlaybookSynthesisTimeline } from '../components/PlaybookSynthesisTimeline';
import { useRecoveryPlaybookOrchestrationLab } from '../hooks/useRecoveryPlaybookOrchestrationLab';
import type { RunResult } from '@service/recovery-playbook-orchestrator';

interface Props {
  readonly tenantId?: string;
}

export const RecoveryPlaybookOrchestrationLabPage = ({ tenantId = 'tenant-recovery' }: Props) => {
  const { status, loading, error, run, refreshSummary, lastSignalCount, playbook } = useRecoveryPlaybookOrchestrationLab({
    workspaceId: `${tenantId}-workspace`,
    tenantId,
    tenantContext: { tenantId, region: 'us-east-1', environment: 'prod' },
  });

  const [runs, setRuns] = useState<RunResult[]>([]);
  const [selected, setSelected] = useState<RunResult | undefined>(undefined);

  const syntheticSignals = useMemo(
    () => [
      {
        id: `${tenantId}-sig-a`,
        signal: 'demo-signal',
        severity: 'low' as const,
        tags: ['lab'],
        confidence: 0.62,
        capturedAt: new Date().toISOString(),
        evidence: [],
      },
    ],
    [tenantId],
  );

  const play = async () => {
    await run();
    const next: RunResult = {
      plan: {
        id: `plan-${runs.length + 1}`,
        playbookId: playbook.id,
        window: {
          start: new Date().toISOString(),
          end: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
          mode: 'full',
        },
        trace: [],
        version: runs.length + 1,
      },
      outcome: {
        id: `outcome-${runs.length + 1}`,
        planId: `plan-${runs.length + 1}`,
        finalBand: runs.length % 2 === 0 ? 'green' : 'amber',
        success: runs.length % 2 === 0,
        durationMinutes: 12,
        traces: [],
        telemetrySnapshot: {
          windowStart: new Date().toISOString(),
          scores: {
            green: 3,
            amber: 1,
            red: 0,
          },
          trend: 'up',
        },
      },
      policyViolations: [],
    };

    setRuns((previous) => [
      ...previous,
      next,
    ]);
    setSelected(next);
  };

  const choose = (next: RunResult) => {
    setSelected(next);
  };

  return (
    <main>
      <h1>Recovery playbook orchestration lab</h1>
      <p>Status: {status}</p>
      {error ? <p role='alert'>{error}</p> : null}

      <PlaybookControlBoard
        playbook={playbook}
        signals={syntheticSignals}
        onRun={play}
        onRefresh={refreshSummary}
        loading={loading}
      />

      <section>
        <h2>Run history</h2>
        <PlaybookSynthesisTimeline runs={runs} />
      </section>

      <section>
        <h2>Impact</h2>
        <PlaybookPolicyImpactPanel summary={selected ?? runs.at(-1)} />
      </section>

      <section>
        <h2>Recent outcomes</h2>
        {runs.map((runItem) => (
          <button key={runItem.outcome.id} type='button' onClick={() => choose(runItem)}>
            {runItem.plan.id} · {runItem.outcome.finalBand}
          </button>
        ))}
      </section>

      <p>lastSignalCount={lastSignalCount}</p>
    </main>
  );
};
