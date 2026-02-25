import type {
  PolicyToken,
  ScenarioToken,
  WorkspaceToken,
} from '@domain/recovery-orchestration-lab-models';
import type { RunId, WorkspaceId } from '@shared/recovery-orchestration-lab-runtime';

type WorkspaceMode = 'design' | 'simulate' | 'execute';

type LaneState = 'idle' | 'active' | 'degraded' | 'stopped';

export interface LabScenarioOverview {
  readonly workspaceId: WorkspaceId;
  readonly scenarioToken: ScenarioToken;
  readonly name: string;
  readonly mode: WorkspaceMode;
  readonly policyToken: PolicyToken;
  readonly owner: string;
  readonly updatedAt: string;
}

export interface LabCommand {
  readonly id: string;
  readonly title: string;
  readonly stage: string;
  readonly enabled: boolean;
  readonly weight: number;
}

export interface LaneHealth {
  readonly lane: string;
  readonly score: number;
  readonly state: LaneState;
}

export interface LabSignalEvent {
  readonly label: string;
  readonly value: number;
  readonly at: string;
}

export interface LabWorkspaceState {
  readonly workspace: WorkspaceToken;
  readonly runId: RunId;
  readonly overview: LabScenarioOverview;
  readonly lanes: readonly LaneHealth[];
  readonly commands: readonly LabCommand[];
  readonly signals: readonly LabSignalEvent[];
}

export interface UseLabWorkspaceArgs {
  readonly workspace: string;
  readonly scenario: string;
  readonly tenant: string;
}

export interface UseLabWorkspaceResult {
  readonly state: LabWorkspaceState;
  readonly isBusy: boolean;
  readonly warnings: readonly string[];
  readonly refresh: () => Promise<void>;
  readonly execute: () => Promise<void>;
  readonly toggleCommand: (commandId: string) => void;
  readonly setMode: (mode: WorkspaceMode) => void;
}

export const modeLabel = (mode: WorkspaceMode): string =>
  ({
    design: 'Design',
    simulate: 'Simulation',
    execute: 'Execution',
  })[mode];

export type { PolicyToken, ScenarioToken, WorkspaceToken };
