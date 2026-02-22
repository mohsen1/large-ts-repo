import { useCallback, useEffect, useMemo, useState } from 'react';

import { FabricController, runScenarioSimulation } from '@service/recovery-fabric-controller';
import {
  type FabricAllocation,
  type FabricCandidate,
  type FabricScenario,
  buildTopologySnapshot,
  summarizeTopology,
  evaluateCandidatePolicy,
  makeFabricPlanId,
  makeFabricRunId,
  validateFabricCandidate,
  validateFabricScenario,
} from '@domain/recovery-fabric-models';
import type { FabricSimulationSummary } from '@service/recovery-fabric-controller';

interface UseRecoveryFabricOrchestrationParams {
  readonly tenantId: string;
  readonly incidentId: string;
}

const buildScenario = (tenantId: string): FabricScenario => {
  const rawScenario = {
    id: `${tenantId}-fabric-scenario`,
    tenantId,
    objective: {
      id: `${tenantId}-objective`,
      name: `${tenantId} continuity objective`,
      targetRtoMinutes: 45,
      targetRpoMinutes: 1,
      maxConcurrentSteps: 5,
      tags: ['recovery', 'fabric'],
    },
    nodes: [
      {
        id: `${tenantId}-node-core`,
        name: 'core-service',
        zone: 'core',
        serviceId: `${tenantId}-svc-core`,
        tenantId,
        readiness: 0.95,
        resilienceScore: 88,
        capabilities: ['primary', 'replication', 'failover'],
      },
      {
        id: `${tenantId}-node-edge`,
        name: 'edge-gateway',
        zone: 'edge',
        serviceId: `${tenantId}-svc-edge`,
        tenantId,
        readiness: 0.79,
        resilienceScore: 69,
        capabilities: ['api', 'throttle', 'circuit-break'],
      },
      {
        id: `${tenantId}-node-sat`,
        name: 'satellite-cache',
        zone: 'satellite',
        serviceId: `${tenantId}-svc-cache`,
        tenantId,
        readiness: 0.72,
        resilienceScore: 64,
        capabilities: ['cache', 'sync'],
      },
    ],
    links: [
      {
        id: `${tenantId}-link-1`,
        from: `${tenantId}-node-core`,
        to: `${tenantId}-node-edge`,
        latencyMs: 420,
        costUnits: 12,
        region: 'us-east-1',
      },
      {
        id: `${tenantId}-link-2`,
        from: `${tenantId}-node-edge`,
        to: `${tenantId}-node-sat`,
        latencyMs: 860,
        costUnits: 30,
        region: 'eu-west-1',
      },
    ],
    routes: [
      {
        id: `${tenantId}-route-primary`,
        sourceNode: `${tenantId}-node-core`,
        targetNode: `${tenantId}-node-edge`,
        kind: 'primary',
        capacity: 10,
        estimatedDurationMinutes: 12,
        constraints: [
          {
            code: 'compliance',
            severity: 'low',
            description: 'requires secondary route checks',
          },
        ],
      },
      {
        id: `${tenantId}-route-secondary`,
        sourceNode: `${tenantId}-node-edge`,
        targetNode: `${tenantId}-node-sat`,
        kind: 'fallback',
        capacity: 7,
        estimatedDurationMinutes: 25,
        constraints: [],
      },
    ],
    window: {
      startedAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      timezone: 'UTC',
      blackoutAt: [],
    },
  };

  return validateFabricScenario(rawScenario);
};

const buildCandidates = (scenario: FabricScenario): readonly FabricCandidate[] => {
  const payload = [
    {
      id: `${scenario.id}-candidate-primary`,
      scenarioId: scenario.id,
      planNodeIds: [scenario.nodes[0].id, scenario.nodes[1].id, scenario.nodes[2].id],
      routeIds: [scenario.routes[0].id, scenario.routes[1].id],
      rationale: 'primary restore route with all nodes',
    },
    {
      id: `${scenario.id}-candidate-core`,
      scenarioId: scenario.id,
      planNodeIds: [scenario.nodes[0].id, scenario.nodes[1].id],
      routeIds: [scenario.routes[0].id],
      rationale: 'fast path preserving core and edge only',
    },
    {
      id: `${scenario.id}-candidate-minimal`,
      scenarioId: scenario.id,
      planNodeIds: [scenario.nodes[0].id],
      routeIds: [scenario.routes[0].id],
      rationale: 'minimal surface to reduce coupling',
    },
  ];

  return payload.map((entry) => validateFabricCandidate(entry));
};

const buildAllocation = (scenario: FabricScenario, candidate: FabricCandidate): FabricAllocation => ({
  tenantId: scenario.tenantId,
  allocatedNodeIds: candidate.planNodeIds,
  expectedRecoveryMinutes: Math.max(1, candidate.planNodeIds.length * 9),
  canaryOrder: [...candidate.planNodeIds],
});

export const useRecoveryFabricOrchestration = ({ tenantId, incidentId }: UseRecoveryFabricOrchestrationParams) => {
  const [scenario] = useState<FabricScenario>(() => buildScenario(tenantId));
  const [selectedCandidateId, setSelectedCandidateId] = useState<FabricCandidate['id']>(
    `${tenantId}-fabric-scenario-candidate-primary` as FabricCandidate['id'],
  );
  const [simulation, setSimulation] = useState<FabricSimulationSummary | undefined>();
  const [simulationError, setSimulationError] = useState<string | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);

  const candidates = useMemo(() => buildCandidates(scenario), [scenario]);

  const selectedCandidate = useMemo(() => {
    const explicit = candidates.find((candidate) => candidate.id === selectedCandidateId);
    return explicit ?? candidates[0];
  }, [candidates, selectedCandidateId]);

  const allocation = useMemo(() => buildAllocation(scenario, selectedCandidate), [selectedCandidate, scenario]);
  const topology = useMemo(() => buildTopologySnapshot(scenario.nodes, scenario.links), [scenario]);
  const topologySummary = useMemo(() => summarizeTopology(scenario.nodes, scenario.links), [scenario]);
  const policyWarnings = useMemo(() => {
    const policyResult = evaluateCandidatePolicy(selectedCandidate, scenario, makeFabricRunId(`${tenantId}-${incidentId}`));
    if (policyResult.allowed) return ['policy-ok'];
    return policyResult.blockingConstraints.map((constraint) => `${constraint.code}:${constraint.severity}`);
  }, [incidentId, selectedCandidate, scenario, tenantId]);

  const runSimulation = useCallback(async () => {
    setIsBusy(true);
    setSimulationError(undefined);
    const result = runScenarioSimulation({
      scenario,
      candidate: selectedCandidate,
      allocation,
      runId: makeFabricRunId(`${tenantId}-${incidentId}`),
      limit: 30,
    });
    if (!result.ok) {
      setSimulationError(result.error.message);
      setSimulation(undefined);
      setIsBusy(false);
      return;
    }

    setSimulation(result.value);
    setIsBusy(false);
  }, [allocation, incidentId, scenario, selectedCandidate, tenantId]);

  const runCommand = useCallback(async () => {
    setIsBusy(true);
    setSimulationError(undefined);
    const controller = new FabricController({
      onProgress: async () => {
        await Promise.resolve();
      },
    });
    const command = {
      scenario,
      candidate: selectedCandidate,
      allocation,
      planId: makeFabricPlanId(`${scenario.id}-plan`),
      runId: makeFabricRunId(`${tenantId}-${incidentId}`),
    };
    const result = await controller.execute(command);
    if (!result.ok) {
      setSimulationError(result.error.message);
      setIsBusy(false);
      return;
    }

    void result.value.traceStatus;
    setIsBusy(false);
  }, [allocation, incidentId, scenario, selectedCandidate, tenantId]);

  useEffect(() => {
    void runSimulation();
  }, [runSimulation]);

  return {
    scenario,
    selectedCandidateId,
    candidates,
    selectedCandidate,
    setSelectedCandidateId,
    allocation,
    simulation,
    simulationError,
    policyWarnings,
    topologySize: topology.nodes.length + topology.edges.length,
    nodeCount: topology.nodes.length,
    routeCount: scenario.routes.length,
    resilienceScore: Number((100 - topologySummary.criticality).toFixed(2)),
    averageLatencyMs: topologySummary.averageLatencyMs,
    isBusy,
    runSimulation,
    runCommand,
  };
};
