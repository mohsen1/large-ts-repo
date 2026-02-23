import { withBrand, normalizeLimit, type Brand, type PageResult } from '@shared/core';

export type DrillLabRunId = Brand<string, 'DrillLabRunId'>;
export type DrillWorkspaceId = Brand<string, 'DrillWorkspaceId'>;
export type DrillScenarioId = Brand<string, 'DrillScenarioId'>;
export type StepExecutionId = Brand<string, 'StepExecutionId'>;
export type ChecklistItemId = Brand<string, 'ChecklistItemId'>;
export type SnapshotChecksum = Brand<string, 'SnapshotChecksum'>;

export type DrillRunStatus = 'queued' | 'preparing' | 'running' | 'paused' | 'completed' | 'failed';
export type DrillStepStatus = 'pending' | 'active' | 'succeeded' | 'warning' | 'failed';
export type DrillPriority = 'critical' | 'high' | 'medium' | 'low';
export type StepFamily = 'containment' | 'mitigation' | 'validation' | 'restore' | 'cleanup';

export interface DrillWorkspaceMetadata {
  readonly tenant: string;
  readonly environment: 'dev' | 'staging' | 'prod';
  readonly ownerTeam: string;
  readonly createdBy: string;
  readonly tags: readonly string[];
  readonly labels?: Record<string, string>;
}

export interface DrillMetricPoint {
  readonly timestamp: string;
  readonly metric: string;
  readonly value: number;
  readonly unit?: string;
  readonly tags?: Record<string, string>;
}

export interface DrillSignal {
  readonly name: string;
  readonly source: 'incident' | 'slo' | 'capacity' | 'policy';
  readonly confidence: number;
  readonly severity: DrillPriority;
  readonly detectedAt: string;
  readonly metric?: DrillMetricPoint;
}

export interface DrillRunStep {
  readonly id: StepExecutionId;
  readonly runId: DrillLabRunId;
  readonly order: number;
  readonly family: StepFamily;
  readonly name: string;
  readonly owner: string;
  readonly status: DrillStepStatus;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly evidence?: string[];
  readonly checkpoints: readonly DrillMetricPoint[];
  readonly metadata: Record<string, unknown>;
}

export interface DrillRunSnapshot {
  readonly id: DrillLabRunId;
  readonly workspaceId: DrillWorkspaceId;
  readonly scenarioId: DrillScenarioId;
  readonly scenarioName: string;
  readonly status: DrillRunStatus;
  readonly startedAt?: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly priority: DrillPriority;
  readonly riskBudgetPercent: number;
  readonly steps: readonly DrillRunStep[];
  readonly signals: readonly DrillSignal[];
  readonly metadata: Record<string, unknown>;
}

export interface DrillRunEnvelope<T extends DrillRunSnapshot = DrillRunSnapshot> {
  readonly payload: T;
  readonly checksum: SnapshotChecksum;
  readonly indexedAt: string;
}

export interface DrillWorkspace {
  readonly id: DrillWorkspaceId;
  readonly scenarioIds: readonly DrillScenarioId[];
  readonly name: string;
  readonly description: string;
  readonly metadata: DrillWorkspaceMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DrillChecklistItem {
  readonly id: ChecklistItemId;
  readonly step: string;
  readonly family: StepFamily;
  readonly prerequisites: readonly ChecklistItemId[];
  readonly slaMinutes: number;
  readonly estimatedMinutes: number;
  readonly runbookRef?: string;
}

export interface DrillScenario {
  readonly id: DrillScenarioId;
  readonly workspaceId: DrillWorkspaceId;
  readonly title: string;
  readonly summary: string;
  readonly blastRadius: 'regional' | 'global';
  readonly steps: readonly DrillChecklistItem[];
  readonly tags: readonly string[];
  readonly objectives: readonly string[];
}

export interface DrillRunQuery {
  readonly workspaceId?: DrillWorkspaceId;
  readonly scenarioId?: DrillScenarioId;
  readonly status?: readonly DrillRunStatus[];
  readonly priority?: DrillPriority;
  readonly from?: string;
  readonly to?: string;
}

export interface DrillRunSummary {
  readonly id: DrillLabRunId;
  readonly workspace: DrillWorkspaceId;
  readonly scenario: string;
  readonly healthScore: number;
  readonly riskScore: number;
  readonly status: DrillRunStatus;
}

export interface DrillHealthFrame {
  readonly timestamp: string;
  readonly stage: 'warm' | 'active' | 'cooldown';
  readonly completionRatio: number;
  readonly riskRatio: number;
}

export interface DrillWorkspacePage {
  readonly page: PageResult<DrillWorkspace>;
}

export interface DrillWorkspacePageArgs {
  readonly limit: number;
  readonly cursor?: string;
  readonly filterByPriority?: DrillPriority;
}

export interface DrillRunWorkspaceResponse {
  readonly runs: readonly DrillRunSnapshot[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
}

export const buildSummaryLine = (snapshot: DrillRunSnapshot): DrillRunSummary => {
  const completed = snapshot.steps.filter((step) => step.status === 'succeeded').length;
  const healthScore = Math.round((completed / Math.max(1, snapshot.steps.length)) * 100);
  return {
    id: snapshot.id,
    workspace: snapshot.workspaceId,
    scenario: snapshot.scenarioName,
    healthScore,
    riskScore: Math.max(0, Math.round(snapshot.riskBudgetPercent * 100)),
    status: snapshot.status,
  };
};

export const createWorkspaceId = (seed: string): DrillWorkspaceId => withBrand(seed, 'DrillWorkspaceId');
export const createRunId = (seed: string): DrillLabRunId => withBrand(seed, 'DrillLabRunId');
export const createScenarioId = (seed: string): DrillScenarioId => withBrand(seed, 'DrillScenarioId');
export const createChecklistItemId = (seed: string): ChecklistItemId => withBrand(seed, 'ChecklistItemId');
export const createChecksum = (seed: string): SnapshotChecksum => withBrand(seed, 'SnapshotChecksum');
export const normalizeSnapshotLimit = (value?: number): number => normalizeLimit(value);

export function toList<T>(value: T): readonly T[];
export function toList<T>(value: readonly T[]): readonly T[];
export function toList<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? [...value] : ([value] as readonly T[]);
}

export const describeRiskBand = (ratio: number): 'green' | 'yellow' | 'red' => {
  if (ratio >= 65) {
    return 'green';
  }
  if (ratio >= 35) {
    return 'yellow';
  }
  return 'red';
};
