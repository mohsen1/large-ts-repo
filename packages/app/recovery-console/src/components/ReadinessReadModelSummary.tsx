import { useMemo } from 'react';

import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import { digestModelReadiness, detectViolationsByPlan } from '@data/recovery-readiness-store';

interface ReadinessReadModelSummaryProps {
  readonly models: readonly ReadinessReadModel[];
  readonly selectedRunId?: string;
}

interface WindowDigest {
  readonly id: string;
  readonly runId: string;
  readonly health: number;
}

const policyEnvelope = {
  policyName: 'Readiness Operational Policy',
  blockedSignalSources: ['manual-check'],
};

function toHealthColor(score: number): 'red' | 'yellow' | 'green' {
  if (score >= 90) {
    return 'red';
  }
  if (score >= 50) {
    return 'yellow';
  }
  return 'green';
}

export const ReadinessReadModelSummary = ({ models, selectedRunId }: ReadinessReadModelSummaryProps) => {
  const selectedModel = useMemo(() => models.find((model) => model.plan.runId === selectedRunId) ?? models[0], [models, selectedRunId]);

  const windows = useMemo<readonly WindowDigest[]>(() => {
    return models
      .flatMap((model) =>
        model.plan.windows.map((window, index) => ({
          id: `${model.plan.runId}:${index}`,
          runId: model.plan.runId,
          health: model.signals.length + Math.max(1, new Date(window.toUtc).getTime() - new Date(window.fromUtc).getTime()),
        })),
      )
      .sort((left, right) => right.health - left.health)
      .slice(0, 6);
  }, [models]);

  const summary = useMemo(() => {
    if (!selectedModel) {
      return [];
    }
    const digest = digestModelReadiness(selectedModel);
    const violations = detectViolationsByPlan(policyEnvelope, selectedModel);
    return [
      `run:${selectedModel.plan.runId}`,
      `risk:${digest.totalSignals}`,
      `owner:${selectedModel.plan.metadata.owner}`,
      `topTarget:${digest.topTarget ?? 'n/a'}`,
      `alerts:${digest.policyAlerts}`,
      `violations:${violations.length}`,
    ];
  }, [selectedModel]);

  if (!selectedModel) {
    return <section>No readiness model selected</section>;
  }

  return (
    <section>
      <h3>Readiness summary</h3>
      <div>
        {summary.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
      <h4>Window health</h4>
      <ul>
        {windows.map((window) => (
          <li key={window.id}>
            {window.runId}: {toHealthColor(window.health)} ({window.health})
          </li>
        ))}
      </ul>
    </section>
  );
};
