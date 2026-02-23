import { evaluateRiskScore, forecastFromScore } from '@domain/recovery-workload-intelligence';
import type {
  ForecastInput,
  WorkloadDependencyEdge,
  WorkloadDependencyGraph,
  WorkloadNode,
  WorkloadSnapshot,
  WorkloadUnitId,
} from '@domain/recovery-workload-intelligence';

const now = (): string => new Date().toISOString();

const seededNode = (tenant: string, index: number): WorkloadNode => {
  const criticality: WorkloadNode['criticality'] = ((index % 5) + 1) as WorkloadNode['criticality'];
  return {
    id: `${tenant}-node-${index}` as WorkloadUnitId,
    name: `${tenant}-service-${index}`,
    team: `team-${index % 4}`,
    region: index % 2 === 0 ? 'us-east-1' : 'eu-west-1',
    primaryDependencies: index > 2 ? [`${tenant}-node-${index - 1}` as WorkloadUnitId] : [],
    criticality,
    targetSlaMinutes: 8 + index,
  };
};

const seededSnapshot = (index: number): WorkloadSnapshot => ({
  nodeId: `tenant-${Math.floor(index / 4)}-node-${index % 4}` as WorkloadUnitId,
  timestamp: now(),
  cpuUtilization: 20 + ((index * 7) % 80),
  iopsUtilization: 30 + ((index * 5) % 50),
  errorRate: index % 6 === 0 ? 35 - (index % 10) : 2 + ((index * 3) % 12),
  throughput: 4_000 + (index * 37) % 3_800,
});

const classifyRisk = (riskScore: number): 5 | 4 | 3 | 2 => {
  const profile = evaluateRiskScore(
    {
      nodeId: 'sample-node' as WorkloadUnitId,
      timestamp: now(),
      cpuUtilization: 30,
      iopsUtilization: 40,
      errorRate: 10,
      throughput: 300,
    },
    {
      severity: 3,
      blastRadius: 'region',
      customerImpact: 25,
      recoveryToleranceSeconds: 120,
    },
  );
  const risk = profile.riskScore + riskScore;
  if (risk >= 0.85) {
    return 5;
  }
  if (risk >= 0.65) {
    return 4;
  }
  if (risk >= 0.35) {
    return 3;
  }
  return 2;
};

export const buildScenarioFromSeed = (tenantId: string, total = 12): readonly ForecastInput[] => {
  return Array.from({ length: total }).map((_, index) => {
    const node = seededNode(tenantId, index);
    const snapshot = seededSnapshot(index);
    const riskScore = Math.min(0.95, Math.max(0.01, (snapshot.cpuUtilization + snapshot.errorRate) / 150));
    forecastFromScore(node.id, `seed-${tenantId}-${index}`, riskScore);

    return {
      node,
      snapshot: { ...snapshot, nodeId: node.id },
      riskVector: {
        severity: classifyRisk(riskScore),
        blastRadius: node.criticality >= 4 ? 'global' : node.criticality >= 3 ? 'region' : 'zone',
        customerImpact: Math.max(1, Math.round(snapshot.cpuUtilization)),
        recoveryToleranceSeconds: Math.max(30, node.targetSlaMinutes * 60),
      },
      lookbackDays: 14,
    };
  });
};

export const buildDependencySeed = (tenantId: string, size = 8): WorkloadDependencyGraph => {
  const nodes: WorkloadNode[] = Array.from({ length: size }, (_, index) => seededNode(tenantId, index + 1));
  const edges = nodes
    .filter((node) => node.primaryDependencies.length > 0)
    .map((node) => ({
      parent: node.primaryDependencies[0] as WorkloadNode['id'],
      child: node.id,
      relationship: (node.criticality >= 4 ? 'hard' : 'soft') as WorkloadDependencyEdge['relationship'],
      latencyMs: 40 + (node.criticality * 20),
    }));
  return { nodes, edges };
};
