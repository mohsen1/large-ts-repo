import { useState } from 'react';
import { useRecoveryFabricOps } from '../hooks/useRecoveryFabricOps';
import { FabricTopologyPanel } from '../components/FabricTopologyPanel';
import { FabricSimulationChart } from '../components/FabricSimulationChart';
import { FabricCheckSummary } from '../components/FabricCheckSummary';
import type { AlertSignal, CommandId, TenantId, FacilityId } from '@domain/recovery-ops-fabric';

const syntheticRows = [
  { nodeId: 'n1', facility: 'facility-1', role: 'ingest', health: 'healthy', cpu: '30', mem: '12', maxCapacity: '120' },
  { nodeId: 'n2', facility: 'facility-2', role: 'routing', health: 'degraded', cpu: '60', mem: '18', maxCapacity: '160' },
  { nodeId: 'n3', facility: 'facility-3', role: 'compute', health: 'healthy', cpu: '72', mem: '35', maxCapacity: '200' },
  { nodeId: 'n4', facility: 'facility-4', role: 'persist', health: 'healthy', cpu: '40', mem: '20', maxCapacity: '210' },
];

const syntheticSignals: AlertSignal[] = Array.from({ length: 14 }, (_, index) => ({
  id: `sig-${index}` as CommandId,
  tenantId: 'tenant-fabric-observatory' as TenantId,
  facilityId: `facility-${(index % 4) + 1}` as FacilityId,
  severity: index % 5 === 0 ? 'critical' : index % 5 === 1 ? 'warning' : 'notice',
  dimension: ['latency', 'throughput', 'errorRate', 'availability', 'capacity'][index % 5],
  value: 90 + index,
  baseline: 80,
  timestamp: new Date(Date.now() - index * 45_000).toISOString(),
  tags: ['automated', 'fabric'],
}));

export const RecoveryOpsFabricObservatoryPage = () => {
  const [facilityId, setFacilityId] = useState('facility-1');
  const {
    planCount,
    status,
    error,
    topology,
    simulationPoints,
    runChecks,
    topologyChecksum,
    execute,
    replay,
  } = useRecoveryFabricOps({
    tenantId: 'tenant-fabric-observatory',
    facilityId,
    facilitySignals: syntheticSignals,
    topologyRows: syntheticRows,
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2>Recovery Ops Fabric Observatory</h2>
      <div>
        <button onClick={() => setFacilityId('facility-1')}>facility-1</button>
        <button onClick={() => setFacilityId('facility-2')}>facility-2</button>
        <button onClick={() => setFacilityId('facility-3')}>facility-3</button>
        <button onClick={() => setFacilityId('facility-4')}>facility-4</button>
      </div>

      <div>
        <button onClick={execute}>Run simulation</button>
        <button onClick={replay}>Replay with what-if</button>
      </div>

      <div>Status: {status}</div>
      <div>Plan steps: {planCount}</div>
      {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FabricTopologyPanel topology={topology} selectedFacility={facilityId} onSelectFacility={setFacilityId} />
        <FabricSimulationChart title="Runbook stress curve" points={simulationPoints} />
      </div>
      <FabricCheckSummary runChecks={runChecks} checksum={topologyChecksum} />
    </div>
  );
};
