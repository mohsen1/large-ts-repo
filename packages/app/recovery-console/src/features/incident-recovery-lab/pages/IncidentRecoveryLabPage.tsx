import { useMemo } from 'react';
import { IncidentRecoveryPulsePanel } from '../components/IncidentRecoveryPulsePanel';
import { IncidentRecoveryTimeline } from '../components/IncidentRecoveryTimeline';
import { IncidentRecoveryScoreBoard } from '../components/IncidentRecoveryScoreBoard';
import { RecoveryLabScenario } from '../types';
import { IncidentRecord } from '@domain/incident-management';
import { ServiceId, TenantId, IncidentId } from '@domain/incident-management';

const now = new Date().toISOString();

const incidentA: IncidentRecord = {
  id: 'lab-incident-a' as IncidentId,
  tenantId: 'tenant-ops' as TenantId,
  serviceId: 'checkout' as ServiceId,
  title: 'Checkout API high error rate',
  details: 'Synthetic incident generated for stress scenario',
  state: 'triaged',
  triage: {
    tenantId: 'tenant-ops' as TenantId,
    serviceId: 'checkout' as ServiceId,
    observedAt: now,
    source: 'alert',
    severity: 'sev2',
    labels: [{ key: 'team', value: 'platform' }],
    confidence: 0.71,
    signals: [{ name: '5xx', value: 82, unit: 'count', at: now }],
  },
  currentStep: 'step-1',
  createdAt: now,
  updatedAt: now,
  metadata: { source: 'synthetic' },
};

const incidentB: IncidentRecord = {
  id: 'lab-incident-b' as IncidentId,
  tenantId: 'tenant-ops' as TenantId,
  serviceId: 'payments' as ServiceId,
  title: 'Payments processor queue overflow',
  details: 'Synthetic incident generated for stress scenario',
  state: 'mitigating',
  triage: {
    tenantId: 'tenant-ops' as TenantId,
    serviceId: 'payments' as ServiceId,
    observedAt: now,
    source: 'slo',
    severity: 'sev1',
    labels: [{ key: 'team', value: 'recovery' }],
    confidence: 0.9,
    signals: [{ name: 'latency_p95', value: 980, unit: 'ms', at: now }],
  },
  currentStep: 'step-drain',
  createdAt: now,
  updatedAt: now,
  metadata: { source: 'synthetic' },
};

const incidentC: IncidentRecord = {
  id: 'lab-incident-c' as IncidentId,
  tenantId: 'tenant-ops' as TenantId,
  serviceId: 'auth' as ServiceId,
  title: 'Auth service token mint timeout',
  details: 'Synthetic incident generated for stress scenario',
  state: 'detected',
  triage: {
    tenantId: 'tenant-ops' as TenantId,
    serviceId: 'auth' as ServiceId,
    observedAt: now,
    source: 'ops-auto',
    severity: 'sev3',
    labels: [{ key: 'team', value: 'identity' }],
    confidence: 0.55,
    signals: [{ name: 'retries', value: 34, unit: 'count', at: now }],
  },
  currentStep: 'step-triage',
  createdAt: now,
  updatedAt: now,
  metadata: { source: 'synthetic' },
};

const scenario: RecoveryLabScenario = {
  id: 'incident-recovery-lab-001',
  title: 'Synthetic recovery stress lab',
  tenantId: 'tenant-ops',
  serviceId: 'platform',
  incidents: [incidentA, incidentB, incidentC],
  riskThreshold: 72,
  createdAt: now,
};

export const IncidentRecoveryLabPage = () => {
  const incidents = useMemo(() => scenario.incidents, []);

  return (
    <main style={{ padding: '1rem', display: 'grid', gap: '1rem', background: 'linear-gradient(180deg, #020617, #111827)', minHeight: '100vh' }}>
      <h1 style={{ color: '#e2e8f0', margin: 0 }}>Incident Recovery Lab</h1>
      <p style={{ color: '#94a3b8', margin: '0 0 1rem' }}>
        Deep stress workspace with typed orchestration, simulation, and scenario scoring.
      </p>

      <IncidentRecoveryPulsePanel scenario={scenario} />
      <IncidentRecoveryTimeline scenario={scenario} />
      <IncidentRecoveryScoreBoard incidents={incidents} />
    </main>
  );
};

export default IncidentRecoveryLabPage;
