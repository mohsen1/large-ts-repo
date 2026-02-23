import type { FusionBundle, FusionReadinessState, FusionWave } from '@domain/recovery-fusion-intelligence';
import type { RawSignalEnvelope } from '@domain/recovery-fusion-intelligence';

export type FusionCommandStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed';

export interface FusionCommandRecord {
  readonly id: string;
  readonly waveId: string;
  readonly action: string;
  readonly actor: string;
  readonly status: FusionCommandStatus;
}

export interface ReadinessSimulationSummary {
  readonly status: 'pending' | 'running' | 'complete' | 'blocked';
  readonly riskScore: number;
  readonly commandCount: number;
  readonly waveCount: number;
}

export interface FusionWorkspaceState {
  readonly tenant: string;
  readonly bundle: FusionBundle | undefined;
  readonly selectedWaveId: string | undefined;
  readonly readinessState: FusionReadinessState;
  readonly loading: boolean;
  readonly summary: ReadinessSimulationSummary | undefined;
  readonly commandLog: readonly FusionCommandRecord[];
  readonly lastErrors: readonly string[];
}

export interface FusionWorkspaceActions {
  readonly runFusion: () => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly selectWave: (waveId: string | undefined) => void;
  readonly acceptSignals: (signals: readonly RawSignalEnvelope[]) => Promise<void>;
}

export interface FusionWorkspaceSnapshot {
  readonly timestamp: string;
  readonly waves: readonly FusionWave[];
  readonly commandCount: number;
  readonly readinessState: FusionReadinessState;
}
