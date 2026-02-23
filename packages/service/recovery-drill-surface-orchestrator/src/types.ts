import type {
  DrillLabRunId,
  DrillScenarioId,
  DrillWorkspaceId,
  DrillRunSnapshot,
  DrillRunQuery,
  DrillRunStatus,
  DrillWorkspace,
  DrillPriority,
} from '@domain/recovery-drill-lab';

export interface SurfaceProfile {
  readonly tenant: string;
  readonly zone: string;
  readonly environment: 'dev' | 'staging' | 'prod';
  readonly maxConcurrentRuns: number;
  readonly preferredPriority: DrillPriority;
}

export interface SurfaceWindow {
  readonly id: string;
  readonly profile: SurfaceProfile;
  readonly from: string;
  readonly to: string;
  readonly createdAt: string;
  readonly tags: readonly string[];
}

export interface SurfaceGoal {
  readonly label: string;
  readonly scoreTarget: number;
  readonly riskTarget: number;
  readonly maxDurationMinutes: number;
}

export interface SurfaceCommand {
  readonly commandId: string;
  readonly type: 'plan' | 'run' | 'validate' | 'drain';
  readonly workspaceId: DrillWorkspaceId;
  readonly scenarioId: DrillScenarioId;
  readonly goal: SurfaceGoal;
  readonly profile: SurfaceProfile;
  readonly requestedBy: string;
  readonly requestedAt: string;
}

export interface SurfaceSchedule {
  readonly workspace: DrillWorkspace;
  readonly scenarioId: DrillScenarioId;
  readonly commandId: string;
  readonly startedAt: string;
  readonly expectedFinishAt: string;
  readonly state: 'queued' | 'active' | 'waiting' | 'blocked' | 'done';
}

export interface SurfaceMetric {
  readonly label: string;
  readonly weight: number;
  readonly value: number;
  readonly observedAt: string;
}

export interface SurfaceAnalysis {
  readonly runId: DrillLabRunId;
  readonly score: number;
  readonly risk: number;
  readonly progress: number;
  readonly velocity: number;
  readonly metrics: readonly SurfaceMetric[];
  readonly blockers: readonly DrillRunStatus[];
}

export interface SurfaceRunBundle {
  readonly workspaceId: DrillWorkspaceId;
  readonly scenarioId: DrillScenarioId;
  readonly command: SurfaceCommand;
  readonly plan: DrillRunSnapshot;
  readonly schedule: SurfaceSchedule;
}

export interface SurfaceQuery {
  readonly workspaceId: DrillWorkspaceId;
  readonly scenarioId: DrillScenarioId;
  readonly from?: string;
  readonly to?: string;
}

export interface SurfaceRepository {
  readonly findRuns: (query: DrillRunQuery) => readonly DrillRunSnapshot[];
  readonly appendRun: (snapshot: DrillRunSnapshot) => void;
  readonly latestRun: (query: Pick<SurfaceQuery, 'workspaceId' | 'scenarioId'>) => DrillRunSnapshot | undefined;
}

export interface SurfaceState {
  readonly activeWindow?: SurfaceWindow;
  readonly commandQueue: readonly SurfaceCommand[];
  readonly completedCount: number;
  readonly failedCount: number;
}

export interface SurfaceCommandResult {
  readonly command: SurfaceCommand;
  readonly snapshot?: DrillRunSnapshot;
  readonly analysis?: SurfaceAnalysis;
  readonly workspace: DrillWorkspace;
}

export interface SurfaceTelemetryPoint {
  readonly runId: DrillLabRunId;
  readonly timestamp: string;
  readonly tag: string;
  readonly weight: number;
  readonly score: number;
}
