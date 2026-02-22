import { Brand } from '@shared/core';

export type RecoveryProgramId = Brand<string, 'RecoveryProgramId'>;
export type RecoveryRunId = Brand<string, 'RecoveryRunId'>;
export type RecoveryCheckpointId = Brand<string, 'RecoveryCheckpointId'>;
export type RecoveryIncidentId = Brand<string, 'RecoveryIncidentId'>;

export type RecoveryPriority = 'bronze' | 'silver' | 'gold' | 'platinum';
export type RecoveryMode = 'preventive' | 'defensive' | 'restorative' | 'emergency';
export type RecoveryStatus = 'draft' | 'staging' | 'running' | 'completed' | 'aborted' | 'failed';

export interface RecoveryWindow {
  startsAt: string;
  endsAt: string;
  timezone: string;
}

export interface RecoveryConstraint {
  name: string;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne';
  threshold: number;
  description: string;
}

export interface RecoveryStep {
  id: string;
  title: string;
  command: string;
  timeoutMs: number;
  dependencies: readonly string[];
  requiredApprovals: number;
  tags: readonly string[];
}

export interface RecoveryTopology {
  rootServices: readonly string[];
  fallbackServices: readonly string[];
  immutableDependencies: readonly [string, string][];
}

export interface RecoveryProgram {
  id: RecoveryProgramId;
  tenant: Brand<string, 'TenantId'>;
  service: Brand<string, 'ServiceId'>;
  name: string;
  description: string;
  priority: RecoveryPriority;
  mode: RecoveryMode;
  window: RecoveryWindow;
  topology: RecoveryTopology;
  constraints: readonly RecoveryConstraint[];
  steps: readonly RecoveryStep[];
  owner: string;
  tags: readonly string[];
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryRunState {
  runId: RecoveryRunId;
  programId: RecoveryProgramId;
  incidentId: RecoveryIncidentId;
  status: RecoveryStatus;
  startedAt?: string;
  completedAt?: string;
  currentStepId?: string;
  nextStepId?: string;
  estimatedRecoveryTimeMinutes: number;
}

export interface RecoveryCheckpoint {
  id: RecoveryCheckpointId;
  runId: RecoveryRunId;
  stepId: string;
  status: Exclude<RecoveryStatus, 'draft'>;
  exitCode: number;
  createdAt: string;
  message: string;
  details: Record<string, unknown>;
}

export interface RunTopologyGraph {
  edges: Record<string, readonly string[]>;
  entryPoints: readonly string[];
  exitPoints: readonly string[];
}

export interface RecoveryProgramQuery {
  tenant?: Brand<string, 'TenantId'>;
  service?: Brand<string, 'ServiceId'>;
  statuses?: readonly RecoveryStatus[];
  after?: string;
  limit?: number;
}

export interface RecoveryProgramProjection {
  id: RecoveryProgramId;
  name: string;
  priority: RecoveryPriority;
  mode: RecoveryMode;
  serviceCount: number;
  stepCount: number;
  hasBlockingConstraints: boolean;
}
