import type { ReactNode } from 'react';

type FusionPolicyStatus = 'stable' | 'warning' | 'degraded';

interface FusionMeshPolicyBadgeProps {
  readonly status: FusionPolicyStatus;
  readonly commandCount: number;
  readonly phaseCount: number;
  readonly className?: string;
}

const statusLabel = (status: FusionPolicyStatus): ReactNode => {
  switch (status) {
    case 'stable':
      return 'Stable';
    case 'warning':
      return 'Warning';
    case 'degraded':
      return 'Degraded';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
};

export const FusionMeshPolicyBadge = ({
  status,
  commandCount,
  phaseCount,
  className,
}: FusionMeshPolicyBadgeProps) => (
  <section className={className ?? ''}>
    <h3>Runtime Policy</h3>
    <p>Class: {statusLabel(status)}</p>
    <p>Commands: {commandCount}</p>
    <p>Phases: {phaseCount}</p>
    <ul>
      <li>active-manifests: {Math.max(0, commandCount - phaseCount)}</li>
      <li>pending-phases: {phaseCount - Math.min(phaseCount, 1)}</li>
      <li>status-index: {[status].indexOf(status)}</li>
    </ul>
  </section>
);
