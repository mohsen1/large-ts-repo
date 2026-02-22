import { useState, type FormEvent } from 'react';
import type { SignalRepository, SignalWindowBuilder } from '@data/incident-signal-store';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { useIncidentSignalWorkspace } from '../hooks/useIncidentSignalWorkspace';
import { createSignalDashboard, type SignalDashboardView } from '@service/recovery-incident-orchestrator';
import { IncidentSignalBoard } from '../components/IncidentSignalBoard';
import {
  buildSignalId,
  makeTenantId,
  makeZoneId,
  type SignalEnvelope,
  type TenantId,
} from '@domain/incident-signal-intelligence';

interface SignalReadinessPageProps {
  readonly signalRepository: SignalRepository;
  readonly incidentRepository: RecoveryIncidentRepository;
  readonly windowBuilder: SignalWindowBuilder;
}

export const SignalReadinessPage = ({
  signalRepository,
  incidentRepository,
  windowBuilder,
}: SignalReadinessPageProps) => {
  const workspace = useIncidentSignalWorkspace(signalRepository, incidentRepository, makeTenantId('default'));
  const [tenantId, setTenantId] = useState<TenantId>(makeTenantId('default'));

  const submitManualRefresh = async () => {
    await workspace.refresh();
  };

  const onTenantSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const dashboard = createSignalDashboard(signalRepository, incidentRepository);
    await dashboard.refresh(tenantId);
    await workspace.refreshForTenant(tenantId);
  };

  const planRows = workspace.state.riskProfiles;
  const seed: SignalDashboardView | null = workspace.state.view;

  return (
    <main className="signal-readiness-page">
      <header>
        <h1>Signal Readiness Console</h1>
      </header>
      <form onSubmit={onTenantSubmit}>
        <label>
          Tenant
          <input
            value={tenantId}
            onChange={(event) => setTenantId(makeTenantId(event.currentTarget.value))}
          />
        </label>
        <button type="submit">Load tenant</button>
      </form>
      <div className="signal-actions">
        <button onClick={submitManualRefresh}>Refresh orchestrations</button>
      </div>
      {workspace.state.loading && <p>Signal engine running...</p>}
      <p>
        {seed
          ? `Signals ${seed.totalSignals}, critical ${seed.criticalSignals}, queued ${seed.plansQueued}`
          : 'No signal snapshot yet'}
      </p>
      <IncidentSignalBoard
        tenantId={tenantId}
        signals={workspace.state.signals}
        riskProfiles={planRows}
        onRefresh={submitManualRefresh}
      />
      <section>
        <h2>Top Priority Signals</h2>
        <ul>
          {workspace.topSignalIds.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Window builder diagnostic</h2>
        <p>
          Windows available: {windowBuilder.buildWindow({
            id: buildSignalId('diag'),
            tenantId: makeTenantId('default'),
            zone: makeZoneId('zone-a'),
            kind: 'availability',
            state: 'observed',
            vector: { magnitude: 0.2, variance: 0.1, entropy: 0.1 },
            risk: 'low',
            recordedAt: new Date().toISOString(),
            correlationKeys: ['diag'],
            meta: {
              source: 'diagnostic',
              observedBy: 'ui',
              region: 'local',
              tags: ['ui', 'diagnostic'],
            },
          } satisfies SignalEnvelope, 15).samples.length}
        </p>
      </section>
    </main>
  );
};
