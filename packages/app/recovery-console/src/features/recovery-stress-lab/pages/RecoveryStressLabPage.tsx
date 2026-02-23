import { useEffect } from 'react';
import { StressLabCommandPalette } from '../components/StressLabCommandPalette';
import { StressLabTopologyBoard } from '../components/StressLabTopologyBoard';
import { StressLabHealthTimeline } from '../components/StressLabHealthTimeline';
import { useRecoveryStressLab } from '../hooks/useRecoveryStressLab';
import {
  createTenantId,
  createRunbookId,
  createStepId,
  createSignalId,
} from '@domain/recovery-stress-lab';

interface RecoveryStressLabPageProps {
  readonly tenantId: string;
}

export const RecoveryStressLabPage = ({ tenantId }: RecoveryStressLabPageProps) => {
  const {
    profile,
    band,
    status,
    errors,
    plan,
    simulation,
    runbooks,
    signals,
    selectedSignals,
    commandCatalog,
    selectedPlanWindows,
    setBand,
    setRunbooks,
    setSignals,
    setSelectedSignalIds,
    buildPlan,
    run,
    runWithService,
  } = useRecoveryStressLab(createTenantId(tenantId));

  useEffect(() => {
    const tenant = createTenantId(tenantId);
    setRunbooks([
      {
        id: createRunbookId('runbook-primary'),
        tenantId: tenant,
        name: 'Primary isolation sequence',
        description: 'Isolates affected workloads and verifies blast-radius recovery',
        steps: [
          {
            commandId: createStepId('step-observe'),
            title: 'Observe impact',
            phase: 'observe',
            estimatedMinutes: 12,
            prerequisites: [],
            requiredSignals: [createSignalId('sig-1')],
          },
          {
            commandId: createStepId('step-isolate'),
            title: 'Isolate dependencies',
            phase: 'isolate',
            estimatedMinutes: 18,
            prerequisites: [createStepId('step-observe')],
            requiredSignals: [createSignalId('sig-1')],
          },
          {
            commandId: createStepId('step-migrate'),
            title: 'Migrate traffic',
            phase: 'migrate',
            estimatedMinutes: 20,
            prerequisites: [createStepId('step-isolate')],
            requiredSignals: [createSignalId('sig-1')],
          },
        ],
        ownerTeam: 'operations',
        cadence: { weekday: 1, windowStartMinute: 360, windowEndMinute: 540 },
      },
      {
        id: createRunbookId('runbook-restore'),
        tenantId: tenant,
        name: 'Restore and verify',
        description: 'Brings workloads back online and verifies SLIs',
        steps: [
          {
            commandId: createStepId('step-verify'),
            title: 'Verify health',
            phase: 'verify',
            estimatedMinutes: 14,
            prerequisites: [createStepId('step-migrate')],
            requiredSignals: [createSignalId('sig-2')],
          },
          {
            commandId: createStepId('step-restore'),
            title: 'Restore steady state',
            phase: 'restore',
            estimatedMinutes: 22,
            prerequisites: [createStepId('step-verify')],
            requiredSignals: [createSignalId('sig-2')],
          },
        ],
        ownerTeam: 'platform',
        cadence: { weekday: 2, windowStartMinute: 420, windowEndMinute: 600 },
      },
    ]);

    setSignals([
      {
        id: createSignalId('sig-1'),
        class: 'availability',
        severity: 'high',
        title: 'latency surge',
        createdAt: new Date().toISOString(),
        metadata: { shard: 'api', region: 'us-east-1' },
      },
      {
        id: createSignalId('sig-2'),
        class: 'integrity',
        severity: 'critical',
        title: 'data consistency warning',
        createdAt: new Date().toISOString(),
        metadata: { system: 'ledger', owner: 'finance' },
      },
    ]);
    setSelectedSignalIds([createSignalId('sig-1'), createSignalId('sig-2')]);
  }, [tenantId, setRunbooks, setSignals, setSelectedSignalIds]);

  return (
    <main>
      <h1>Recovery Stress Lab</h1>
      <p>{`tenant ${tenantId}`}</p>
      <p>{`status ${status}`}</p>
      <p>{`profile enabled ${profile.enabled}`}</p>
      <p>{`selected signals: ${selectedSignals.length ? selectedSignals.map((signal) => signal.title).join(', ') : 'none'}`}</p>
      <label>
        Band:
        <select value={band} onChange={(event) => setBand(event.target.value as typeof band)}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
      </label>

      <div>
        <button type="button" onClick={buildPlan} disabled={status === 'planning'}>
          Build plan
        </button>
        <button type="button" onClick={run} disabled={status === 'simulating'}>
          Run simulation
        </button>
        <button type="button" onClick={runWithService}>
          Run through orchestrator
        </button>
      </div>

      {errors.length > 0 ? <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
      <StressLabCommandPalette
        commands={commandCatalog}
        selectedCommandId={selectedSignals[0]?.id}
        onSelectCommand={(id) => {
          setSelectedSignalIds((current) =>
            current.includes(id)
              ? current.filter((value) => value !== id)
              : [...current, id],
          );
        }}
      />
      <StressLabTopologyBoard plan={plan} simulation={simulation} runbooks={runbooks} />
      <StressLabHealthTimeline simulation={simulation} />

      <section>
        <h2>Plan windows</h2>
        <ul>
          {selectedPlanWindows.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Signals</h2>
        <ul>
          {signals.map((signal) => (
            <li key={signal.id}>{`${signal.class}:${signal.title}:${signal.severity}`}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
