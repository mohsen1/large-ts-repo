import { useMemo } from 'react';
import type { ReadinessPolicy, ReadinessRunId } from '@domain/recovery-readiness';

interface ReadinessPolicyPanelProps {
  readonly policy: ReadinessPolicy;
  readonly runIds: readonly ReadinessRunId[];
  readonly selectedRunId?: ReadinessRunId;
}

interface PolicyMetric {
  readonly label: string;
  readonly value: string;
}

interface PolicyAction {
  readonly label: string;
  readonly variant: 'primary' | 'warning' | 'critical';
}

export const ReadinessPolicyPanel = ({ policy, runIds, selectedRunId }: ReadinessPolicyPanelProps) => {
  const policyActions = useMemo<PolicyAction[]>(() => {
    const base: PolicyAction[] = [
      { label: 'view-coverage', variant: 'primary' },
      { label: 'inspect-blockers', variant: 'warning' },
    ];
    if (policy.constraints.forbidParallelity) {
      return [...base, { label: 'enforce-serial', variant: 'critical' }];
    }
    return [...base, { label: 'enable-parallel', variant: 'primary' }];
  }, [policy.constraints.forbidParallelity]);

  const metrics = useMemo<readonly PolicyMetric[]>(() => {
    return [
      { label: 'Policy ID', value: policy.policyId },
      { label: 'Mode', value: policy.name },
      { label: 'Allowed regions', value: `${policy.allowedRegions.size}` },
      { label: 'Blocked sources', value: `${policy.blockedSignalSources.length}` },
      { label: 'Min window', value: `${policy.constraints.minWindowMinutes}m` },
      { label: 'Max window', value: `${policy.constraints.maxWindowMinutes}m` },
      { label: 'Coverage', value: `${policy.constraints.minTargetCoveragePct}` },
      { label: 'Windowed runs', value: `${runIds.length}` },
    ];
  }, [policy, runIds.length]);

  const selectedHint = useMemo(() => {
    if (!selectedRunId) {
      return 'none';
    }
    return runIds.includes(selectedRunId) ? selectedRunId : 'unbound';
  }, [runIds, selectedRunId]);

  return (
    <section>
      <h2>Readiness policy panel</h2>
      <p>Selected run: {selectedHint}</p>
      <ul>
        {metrics.map((metric) => (
          <li key={metric.label}>
            <strong>{metric.label}:</strong> {metric.value}
          </li>
        ))}
      </ul>
      <div>
        {policyActions.map((action) => (
          <button
            key={action.label}
            type="button"
            data-variant={action.variant}
            style={{
              marginRight: 8,
              marginBottom: 4,
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      <h3>Constraint map</h3>
      <dl>
        {Object.entries({
          windowRange: `${policy.constraints.minWindowMinutes}-${policy.constraints.maxWindowMinutes}`,
          coverage: `${Math.round(policy.constraints.minTargetCoveragePct * 100)}%`,
          parallelity: policy.constraints.forbidParallelity ? 'forbidden' : 'allowed',
        }).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
