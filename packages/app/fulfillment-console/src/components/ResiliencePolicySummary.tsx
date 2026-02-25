import { useMemo } from 'react';
import type { OrchestrationResult } from '@service/recovery-resilience-orchestrator';

interface ResiliencePolicySummaryProps {
  readonly result?: OrchestrationResult;
}

export const ResiliencePolicySummary = ({ result }: ResiliencePolicySummaryProps) => {
  const status = useMemo(() => {
    if (!result) {
      return 'idle';
    }
    if (result.status === 'complete') {
      return 'active';
    }
    return result.status;
  }, [result]);

  if (!result) {
    return <p>No orchestration result yet.</p>;
  }

  const zones = result.policy.targetZones;
  const channels = result.channels.join(', ');

  return (
    <article>
      <h4>Policy</h4>
      <p>
        Policy <strong>{result.policy.id}</strong> is <strong>{status}</strong> with checksum <strong>{result.plan.checksum}</strong>.
      </p>
      <p>Zone preference: {zones.join(' / ')}</p>
      <p>Enabled channels: {channels}</p>
      <ul>
        {result.plan.steps.map((step) => (
          <li key={step.stepId}>
            {step.name} ({step.requiredZones.join(', ')})
          </li>
        ))}
      </ul>
    </article>
  );
};
