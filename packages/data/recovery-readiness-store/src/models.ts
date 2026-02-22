import type { ReadinessTarget, RecoveryReadinessPlan, ReadinessSignal, ReadinessRunId } from '@domain/recovery-readiness';

export interface ReadinessReadModel {
  plan: RecoveryReadinessPlan;
  targets: ReadinessTarget[];
  signals: ReadinessSignal[];
  revision: number;
  updatedAt: string;
}

export interface RunIndex {
  runId: ReadinessRunId;
  planId: RecoveryReadinessPlan['planId'];
  state: RecoveryReadinessPlan['state'];
  riskBand: RecoveryReadinessPlan['riskBand'];
}

export interface SignalFilter {
  runId?: ReadinessRunId;
  source?: ReadinessSignal['source'];
  minSeverity?: ReadinessSignal['severity'];
}

export interface StoreSnapshot {
  createdRuns: number;
  updatedRuns: number;
  failedWrites: number;
  totalSignals: number;
}

export interface PersistedArtifact {
  namespace: 'drift-currents';
  runId: ReadinessRunId;
  sha256: string;
  payloadPath: string;
  schemaVersion: number;
}
