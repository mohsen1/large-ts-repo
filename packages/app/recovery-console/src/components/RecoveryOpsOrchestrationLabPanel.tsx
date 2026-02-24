import { useMemo, type ReactNode } from 'react';
import type { OrchestrationLab, OrchestrationPolicy, LabSignal } from '@domain/recovery-ops-orchestration-lab';
import { useRecoveryOpsLabSignals } from '../hooks/useRecoveryOpsLabSignals';

type PanelVariant = 'compact' | 'full';

interface RecoveryOpsOrchestrationLabPanelProps {
  readonly lab: OrchestrationLab;
  readonly policy: OrchestrationPolicy;
  readonly runSummary?: string;
  readonly variant?: PanelVariant;
}

const tierColor = (tier: LabSignal['tier']): string => {
  if (tier === 'critical') return '#d32f2f';
  if (tier === 'warning') return '#f57c00';
  return '#2e7d32';
};

const SignalDot = ({ tier, score }: { tier: LabSignal['tier']; score: number }): ReactNode => {
  const color = tierColor(tier);
  const title = `${tier} · ${score.toFixed(1)}`;
  return (
    <span
      title={title}
      style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'inline-block',
        marginRight: 6,
      }}
    />
  );
};

export const RecoveryOpsOrchestrationLabPanel = ({
  lab,
  policy,
  runSummary,
  variant = 'full',
}: RecoveryOpsOrchestrationLabPanelProps) => {
  const { trends, signalCount, criticalCount, warningCount, maxScore, avgScore } = useRecoveryOpsLabSignals(lab);

  const orderedSignals = useMemo(
    () => [...lab.signals].sort((left, right) => right.score - left.score),
    [lab.signals],
  );

  const headline = {
    plans: lab.plans.length,
    windows: lab.windows.length,
    tenant: lab.tenantId,
    policy: `${policy.id} [${policy.maxParallelSteps}]`,
  };

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <h3>Recovery Ops Orchestration Lab</h3>
      <p>{`${headline.tenant} • plans=${headline.plans} windows=${headline.windows}`}</p>
      <p>{`policy=${headline.policy}`}</p>
      <p>{`signals=${signalCount} critical=${criticalCount} warning=${warningCount}`}</p>
      <p>{`scores max=${maxScore.toFixed(2)} avg=${avgScore.toFixed(2)}`}</p>
      <p>{`run=${runSummary ?? 'not-started'}`}</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {trends.map((trend) => (
          <div key={trend.tier} style={{ border: '1px dashed #aaa', borderRadius: 6, padding: 8 }}>
            <strong>{trend.tier}</strong>
            <div>count={trend.count}</div>
            <div>score={trend.score.toFixed(2)}</div>
          </div>
        ))}
      </div>
      {variant === 'full' ? (
        <ul>
          {orderedSignals.slice(0, 6).map((signal) => (
            <li key={signal.id}>
              <SignalDot tier={signal.tier} score={signal.score} />
              {signal.title} - {signal.score.toFixed(1)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
