import { Brand, NodeId, Edge } from '@shared/core';
import { Contract } from '@domain/contracts';

export type PolicyOrchestratorId = Brand<string, 'PolicyOrchestratorId'>;
export type PolicyBatchId = Brand<string, 'PolicyBatchId'>;
export type OrchestrationNodeId = Brand<string, 'OrchestrationNodeId'>;

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type OrchestrationState = 'draft' | 'queued' | 'active' | 'paused' | 'degraded' | 'completed' | 'failed';

export type StrategyMode = 'canary' | 'blue-green' | 'rolling' | 'linear';

export interface PolicyExecutionWindow {
  id: PolicyBatchId;
  start: string;
  end: string;
  timezone: string;
}

export interface PolicyContextSpec {
  principal: string;
  resource: string;
  action: string;
  attributes: Record<string, unknown>;
  now: string;
}

export interface PolicyTarget {
  region: string;
  service: string;
  environment: 'prod' | 'staging' | 'dev';
  tags: readonly string[];
}

export interface PolicyArtifact {
  id: PolicyOrchestratorId;
  name: string;
  description: string;
  owner: string;
  target: PolicyTarget;
  expression: string;
  severity: Severity;
  state: OrchestrationState;
  mode: StrategyMode;
  priority: Priority;
  windows: readonly PolicyExecutionWindow[];
  version: number;
  revision: string;
  contract?: Contract;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyDependency {
  from: OrchestrationNodeId;
  to: OrchestrationNodeId;
}

export interface PolicyNode {
  id: OrchestrationNodeId;
  artifact: PolicyArtifact;
  dependsOn: readonly OrchestrationNodeId[];
  retries: number;
  timeoutSeconds: number;
  requiresHumanApproval: boolean;
  ownerTeam: string;
  slaWindowMinutes: number;
}

export interface PolicyGraph {
  nodes: readonly PolicyNode[];
  edges: readonly PolicyDependency[];
}

export interface PolicyPlanStep {
  batchId: PolicyBatchId;
  nodeIds: readonly OrchestrationNodeId[];
  order: number;
  maxConcurrency: number;
  estimatedLatencyMs: number;
}

export interface PolicyPlan {
  id: Brand<string, 'PolicyPlanId'>;
  orchestrator: PolicyOrchestratorId;
  steps: readonly PolicyPlanStep[];
  createdAt: string;
  state: OrchestrationState;
  revision: number;
}

export interface PolicyRunRequest {
  planId: PolicyPlan['id'];
  actor: string;
  reason: string;
  dryRun: boolean;
  overrides: Readonly<Record<string, string>>;
}

export interface PolicyDecision {
  artifactId: PolicyOrchestratorId;
  principal: string;
  allowed: boolean;
  rationale: string[];
  evaluatedAt: string;
}

export interface PolicySimulationPoint {
  request: PolicyContextSpec;
  decisions: readonly PolicyDecision[];
  latencyMs: number;
  cacheHit: boolean;
}

export interface PolicySimulationResult {
  nodeId: OrchestrationNodeId;
  outcomes: readonly PolicySimulationPoint[];
  successRatio: number;
  p95LatencyMs: number;
}

export interface PolicyWave {
  wave: number;
  nodes: readonly PolicyNode[];
  edges: readonly Edge<NodeId, { fromDependency: OrchestrationNodeId; weight: number }>[];
}

export interface PolicyExecutionDigest {
  planId: PolicyPlan['id'];
  startedAt: string;
  elapsedMs: number;
  waves: readonly PolicyWave[];
  summary: {
    totalNodes: number;
    succeeded: number;
    failed: number;
    retried: number;
  };
}
