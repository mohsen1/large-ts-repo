import { useMemo } from 'react';
import type { ReadinessRunId, ReadinessPolicy } from '@domain/recovery-readiness';
import { compareStrategies, projectReadinessStrategies, type StrategyBundle, type StrategyProjection } from '@domain/recovery-readiness';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import { readModelHealths } from '@data/recovery-readiness-store';
import { summarizeOrchestratorState } from '@service/recovery-readiness-orchestrator';

interface ReadinessStrategyBoardProps {
  readonly models: readonly ReadinessReadModel[];
  readonly policy: ReadinessPolicy;
  readonly selectedRunId?: ReadinessRunId;
}

interface StrategyRow {
  readonly runId: string;
  readonly score: number;
  readonly grade: string;
  readonly trend: StrategyProjection['trend'];
  readonly topDirective: number;
}

export const ReadinessStrategyBoard = ({ models, policy, selectedRunId }: ReadinessStrategyBoardProps) => {
  const snapshots = useMemo(
    () =>
      models.map((model) => ({
        plan: model.plan,
        targets: model.targets,
        signals: model.signals,
        directives: model.directives,
      })),
    [models],
  );

  const bundles = useMemo(() => projectReadinessStrategies(snapshots, policy), [snapshots, policy]);
  const rows = useMemo<readonly StrategyRow[]>(() => {
    const health = readModelHealths(models);
    return bundles.map((bundle) => {
      const healthScore = health.find((entry) => entry.runId === bundle.runId)?.score ?? 0;
      const topProjection = bundle.projections[0];
      return {
        runId: bundle.runId,
        score: bundle.score,
        grade: bundle.grade,
        trend: topProjection?.trend ?? 'stable',
        topDirective: Math.round((bundle.rationale.length + healthScore) / 10),
      };
    });
  }, [bundles, models]);

  const digest = useMemo(() => summarizeOrchestratorState(models), [models]);
  const best = useMemo(() => {
    const ranked = [...bundles].sort((left, right) => right.score - left.score);
    return ranked[0];
  }, [bundles]);

  return (
    <section>
      <h2>Readiness strategy board</h2>
      <p>{`workspace: ${bundles.length}`}</p>
      <p>{`warnings:${digest.totalWarnings}`}</p>
      <p>{`best:${best?.runId ?? 'none'}`}</p>
      <p>{`selected:${selectedRunId ?? 'none'}`}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.runId}>
            {row.runId} · {row.score} · {row.grade} · {row.trend} · directives={row.topDirective}
          </li>
        ))}
      </ul>
    </section>
  );
};
