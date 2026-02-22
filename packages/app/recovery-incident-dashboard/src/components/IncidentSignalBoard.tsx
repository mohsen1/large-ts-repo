import { useMemo } from 'react';
import {
  makeSignalPlanCandidateId,
  makeTenantId,
  type SignalEnvelope,
  type SignalRiskProfile,
  type SignalPlanCandidate,
  projectSpread,
} from '@domain/incident-signal-intelligence';
import { buildEdgesFromSignals, buildSignalCatalog } from '@data/incident-signal-store';

export interface IncidentSignalBoardProps {
  readonly tenantId: string;
  readonly signals: readonly SignalEnvelope[];
  readonly riskProfiles: readonly SignalRiskProfile[];
  readonly onRefresh: () => void;
}

const synthesizePlansFromProfiles = (
  tenantId: string,
  riskProfiles: readonly SignalRiskProfile[],
): readonly SignalPlanCandidate[] =>
  riskProfiles
    .map((entry) => ({
      id: makeSignalPlanCandidateId(`plan-${entry.signalId}`),
      signalId: entry.signalId,
      tenantId: makeTenantId(tenantId),
      title: `Plan for ${entry.signalId}`,
      rationale: `Auto-generated on ${entry.mitigationLeadMinutes}m SLA`,
      actions: [
        {
          type: 'notify',
          priority: 4,
          target: 'runtime',
        },
      ],
      expectedDowntimeMinutes: entry.mitigationLeadMinutes,
      approved: false,
    } satisfies SignalPlanCandidate));

export const IncidentSignalBoard = ({ tenantId, signals, riskProfiles, onRefresh }: IncidentSignalBoardProps) => {
  const edges = useMemo(() => buildEdgesFromSignals(signals), [signals]);
  const plans = useMemo(() => synthesizePlansFromProfiles(tenantId, riskProfiles), [tenantId, riskProfiles]);
  const catalog = useMemo(() => buildSignalCatalog(signals, plans, tenantId), [signals, plans, tenantId]);

  const spread = useMemo(() => {
    const projections = signals
      .map((signal) => {
        const value = projectSpread(signals, edges, signal.id, 3);
        return `${value.sourceId}:${value.topBand}:${value.reached}`;
      })
      .filter((entry) => entry.includes('critical') || entry.includes(':1'))
      .slice(0, 12);
    return projections;
  }, [signals, edges]);

  return (
    <section className="incident-signal-board">
      <header>
        <h2>Incident Signal Board</h2>
        <p>
          Tenant {tenantId} · Signals {signals.length} · Plans {catalog.topPlans.length}
        </p>
      </header>
      <button onClick={() => onRefresh()}>Refresh Signal View</button>
      <div className="incident-signal-summary">
        <span>Total impact {catalog.aggregate.averageImpact}</span>
        <span>Open actions {catalog.aggregate.openActions}</span>
        <span>Critical {catalog.aggregate.topCritical}</span>
      </div>
      <ul>
        {signals.slice(0, 12).map((signal) => (
          <li key={signal.id} className="incident-signal-item">
            <div>
              <strong>{signal.id}</strong>
              <span>{signal.kind}</span>
              <span>{signal.zone}</span>
              <em>{signal.risk}</em>
            </div>
            <div>
              <small>State {signal.state}</small>
              <small>Magnitude {signal.vector.magnitude.toFixed(3)}</small>
              <small>Variance {signal.vector.variance.toFixed(3)}</small>
            </div>
          </li>
        ))}
      </ul>
      <section>
        <h3>Spread projections</h3>
        <ul>
          {spread.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Critical candidates</h3>
        <ul>
          {catalog.criticalSignals.map((signal) => (
            <li key={signal.id}>{signal.id}: {signal.meta.source}</li>
          ))}
        </ul>
      </section>
    </section>
  );
};
