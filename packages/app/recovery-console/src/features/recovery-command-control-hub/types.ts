import { type HubRunId, type HubExecution } from '@domain/recovery-command-control-hub';

export interface ControlHubFilter {
  readonly tenant: string;
  readonly impactBand?: 'critical' | 'high' | 'medium' | 'low';
  readonly minRiskScore?: number;
}

export interface ControlHubCommandDraft {
  readonly commandName: string;
  readonly component: string;
  readonly ownerTeam: string;
  readonly impactBand: 'critical' | 'high' | 'medium' | 'low';
  readonly estimatedDurationMs: number;
}

export interface ControlHubPageState {
  readonly tenant: string;
  readonly runId: HubRunId;
  readonly filter: ControlHubFilter;
  readonly draftedCount: number;
  readonly inFlight: boolean;
  readonly notes: readonly string[];
  readonly execution?: HubExecution;
}

export const isControlHubReady = (value: ControlHubPageState): boolean => value.draftedCount > 0;
