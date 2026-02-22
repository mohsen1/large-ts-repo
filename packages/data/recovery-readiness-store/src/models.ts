import type {
  ReadinessTarget,
  RecoveryReadinessPlan,
  ReadinessSignal,
  ReadinessRunId,
  ReadinessDirective
} from '@domain/recovery-readiness';

export interface ReadinessReadModel {
  plan: RecoveryReadinessPlan;
  targets: ReadinessTarget[];
  signals: ReadinessSignal[];
  directives: ReadinessDirective[];
  revision: number;
  updatedAt: string;
}

export interface RunIndex {
  runId: ReadinessRunId;
  planId: RecoveryReadinessPlan['planId'];
  state: RecoveryReadinessPlan['state'];
  riskBand: RecoveryReadinessPlan['riskBand'];
  owner: RecoveryReadinessPlan['metadata']['owner'];
  tags: readonly string[];
}

export interface SignalFilter {
  runId?: ReadinessRunId;
  source?: ReadinessSignal['source'];
  minSeverity?: ReadinessSignal['severity'];
  planState?: RecoveryReadinessPlan['state'];
  tags?: readonly string[];
}

export interface StoreSnapshot {
  createdRuns: number;
  updatedRuns: number;
  failedWrites: number;
  totalSignals: number;
  lastUpdatedAt?: string;
}

export interface PersistedArtifact {
  namespace: 'drift-currents';
  runId: ReadinessRunId;
  sha256: string;
  payloadPath: string;
  schemaVersion: number;
}

export interface ReadinessWindowDigest {
  runId: ReadinessRunId;
  windowIndex: number;
  activeDirectives: number;
  criticality: number;
  riskBand: RecoveryReadinessPlan['riskBand'];
}

export interface ReadinessRepositoryMetrics {
  totalTracked: number;
  activeSignals: number;
  activeRuns: number;
  snapshots: number;
}
