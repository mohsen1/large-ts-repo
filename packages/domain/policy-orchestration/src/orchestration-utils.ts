import { PolicyArtifact, PolicyContextSpec, PolicyGraph, PolicyNode } from './models';

export interface NodeLoad {
  nodeId: PolicyNode['id'];
  score: number;
}

export interface ArtifactEnvelope {
  artifact: PolicyArtifact;
  graph: PolicyGraph;
  nodeLoad: NodeLoad[];
  context: PolicyContextSpec;
}

export const calculateWindowCoverageMinutes = (artifact: PolicyArtifact): number => {
  return artifact.windows.reduce((acc, window) => {
    const start = new Date(window.start).getTime();
    const end = new Date(window.end).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return acc;
    return acc + (end - start) / (60 * 1000);
  }, 0);
};

export const hasExpiredWindows = (artifact: PolicyArtifact): boolean => {
  const now = Date.now();
  return artifact.windows.every((window) => {
    const end = new Date(window.end).getTime();
    return !Number.isNaN(end) && end < now;
  });
};

export const defaultContextFromArtifact = (artifact: PolicyArtifact): PolicyContextSpec => ({
  principal: artifact.owner,
  resource: artifact.target.service,
  action: 'evaluate',
  attributes: {
    artifactId: artifact.id,
    severity: artifact.severity,
    mode: artifact.mode,
    priority: artifact.priority,
  },
  now: new Date().toISOString(),
});

export const estimatePriorityScore = (artifact: PolicyArtifact): number => {
  const severityWeight = artifact.severity === 'critical' ? 100 : artifact.severity === 'high' ? 80 : artifact.severity === 'medium' ? 50 : 20;
  const modeWeight = artifact.mode === 'canary' ? 10 : artifact.mode === 'rolling' ? 20 : artifact.mode === 'blue-green' ? 40 : 30;
  const retryWeight = Math.max(0, 50 - artifact.version * 5);
  return severityWeight + modeWeight + retryWeight + calculateWindowCoverageMinutes(artifact) / 5;
};

export const enrichNodeLoad = (artifact: PolicyArtifact, graph: PolicyGraph): NodeLoad[] => {
  const nodes: NodeLoad[] = [];
  for (const node of graph.nodes) {
    const base = estimatePriorityScore(node.artifact);
    const depends = node.dependsOn.length;
    const weight = base + depends * 12;
    nodes.push({ nodeId: node.id, score: weight });
  }
  return nodes.sort((a, b) => b.score - a.score);
};

export const describeArtifact = (artifact: PolicyArtifact): string => {
  const flags = `${artifact.mode}/${artifact.state}/${artifact.priority}`;
  const windows = artifact.windows.length;
  const coverage = calculateWindowCoverageMinutes(artifact);
  return `${artifact.name}(${flags}) windows=${windows} coverage=${coverage.toFixed(2)}m`;
};

export const toPayloadEnvelope = (artifact: PolicyArtifact, graph: PolicyGraph): ArtifactEnvelope => ({
  artifact,
  graph,
  nodeLoad: enrichNodeLoad(artifact, graph),
  context: defaultContextFromArtifact(artifact),
});
