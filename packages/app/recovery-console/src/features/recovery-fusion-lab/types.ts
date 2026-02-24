import type { LabCommand, LabSignal, LabWave } from '@domain/recovery-fusion-lab-core';
import type { FusionLabExecutionRequest, FusionLabExecutionResult } from '@service/recovery-fusion-lab-orchestrator';

export type FusionLabMode = 'draft' | 'live' | 'audit';

export type FusionLabCommandAction = 'start' | 'pause' | 'resume' | 'validate';

export interface FusionLabPageParams {
  readonly tenant: string;
  readonly workspace: string;
}

export interface FusionLabFilter {
  readonly mode: FusionLabMode;
  readonly includeSimulation: boolean;
  readonly minimumSeverity: number;
}

export interface FusionLabTopologyNode {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly score: number;
}

export interface FusionLabPageState {
  readonly loading: boolean;
  readonly errorMessage?: string;
  readonly workspace: string;
  readonly waveCount: number;
  readonly signalCount: number;
  readonly commandCount: number;
  readonly healthScore: number;
  readonly mode: FusionLabMode;
  readonly selectedNodeId?: string;
}

export interface FusionLabWorkspaceEnvelope {
  readonly request: FusionLabExecutionRequest;
  readonly result?: FusionLabExecutionResult;
  readonly state: FusionLabPageState;
}

export interface FusionLabTopologyProps {
  readonly nodes: readonly FusionLabTopologyNode[];
  readonly selectedId?: string;
  readonly onSelect: (nodeId: string) => void;
}

export interface FusionLabPanelProps {
  readonly state: FusionLabPageState;
  readonly latestSignals: readonly LabSignal[];
  readonly onAction: (action: FusionLabCommandAction, command: LabCommand) => void;
}

export interface FusionLabCommandCard {
  readonly command: LabCommand;
  readonly disabled: boolean;
  readonly score: number;
}

export interface FusionLabTimeline {
  readonly waves: readonly LabWave[];
  readonly signals: readonly LabSignal[];
}
