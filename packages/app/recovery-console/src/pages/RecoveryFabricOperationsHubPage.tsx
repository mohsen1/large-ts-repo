import { useState } from 'react';

import { RecoveryFabricControlDeck } from '../components/RecoveryFabricControlDeck';
import { RecoveryFabricRiskRadar } from '../components/RecoveryFabricRiskRadar';
import { RecoveryFabricTopologyLegend } from '../components/RecoveryFabricTopologyLegend';
import { useRecoveryFabricOrchestration } from '../hooks/useRecoveryFabricOrchestration';
import { buildTopologyEdges } from '@domain/recovery-fabric-models';

interface RecoveryFabricOperationsHubPageProps {
  readonly tenantId: string;
  readonly incidentId: string;
}

export const RecoveryFabricOperationsHubPage = ({ tenantId, incidentId }: RecoveryFabricOperationsHubPageProps) => {
  const {
    candidates,
    selectedCandidateId,
    selectedCandidate,
    setSelectedCandidateId,
    allocation,
    simulation,
    simulationError,
    policyWarnings,
    topologySize,
    isBusy,
    scenario,
    runCommand,
    runSimulation,
  } = useRecoveryFabricOrchestration({ tenantId, incidentId });

  const [zoneFilter, setZoneFilter] = useState<'all' | 'core' | 'edge' | 'satellite'>('all');
  const edges = buildTopologyEdges(scenario.nodes, scenario.links);

  return (
    <main>
      <h1>Recovery Fabric operations hub</h1>
      <section>
        <p>{`tenant ${tenantId}`}</p>
        <p>{`incident ${incidentId}`}</p>
        <p>{`topology units: ${topologySize}`}</p>
        <p>{`selected candidate: ${selectedCandidate.id}`}</p>
      </section>

      <RecoveryFabricControlDeck
        scenario={scenario}
        allocation={allocation}
        candidates={candidates}
        selectedCandidateId={selectedCandidateId}
        setSelectedCandidateId={setSelectedCandidateId}
        onRun={runCommand}
        onDryRun={runSimulation}
        isBusy={isBusy}
        window={scenario.window}
      />

      <RecoveryFabricRiskRadar scenario={scenario} candidateNodeIds={selectedCandidate.planNodeIds} />

      <RecoveryFabricTopologyLegend
        edges={edges}
        zoneFilter={zoneFilter}
        onZoneFilterChange={setZoneFilter}
      />

      <section>
        <h2>Policy and simulation</h2>
        <ul>
          {policyWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        {simulation && (
          <p>
            {`simulation success: ${(simulation.successProbability * 100).toFixed(2)}% ; predicted ${simulation.predictedMinutes}m; points ${simulation.riskTrail.length}`}
          </p>
        )}
        {simulationError && <p style={{ color: '#ff4d4f' }}>{simulationError}</p>}
      </section>
    </main>
  );
};
