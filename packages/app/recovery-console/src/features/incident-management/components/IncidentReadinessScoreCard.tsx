import type { ReactElement } from 'react';
import type { IncidentManagementSummary } from '../types';

interface IncidentReadinessScoreCardProps {
  readonly summary: IncidentManagementSummary;
}

export const IncidentReadinessScoreCard = ({ summary }: IncidentReadinessScoreCardProps): ReactElement => (
  <aside>
    <h3>Readiness Scorecard</h3>
    <p>{`Tenant: ${summary.tenantId}`}</p>
    <p>{`Open incidents: ${summary.totalOpen}`}</p>
    <p>{`Critical incidents: ${summary.totalCritical}`}</p>
    <p>{`Readiness score: ${summary.avgReadiness}`}</p>
    <p>{`Alert count: ${summary.alertCount}`}</p>
  </aside>
);
