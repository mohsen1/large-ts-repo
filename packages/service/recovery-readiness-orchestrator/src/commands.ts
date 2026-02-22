import type {
  RecoveryReadinessPlanDraft,
  ReadinessSignal,
  RecoveryReadinessPlan,
  ReadinessTarget,
  RecoveryRunId
} from '@domain/recovery-readiness';

export interface ReadinessPlanCommand {
  draftId: string;
  draft: RecoveryReadinessPlanDraft;
  requestedBy: string;
  requestedAt: string;
  priority: 'normal' | 'high' | 'critical';
}

export interface ReadinessSignalCommand {
  signal: ReadinessSignal;
  receivedVia: 'api' | 'webhook' | 'cron';
}

export type OrchestratorCommand = ReadinessPlanCommand | ReadinessSignalCommand;

export interface ActivationWindow {
  plan: RecoveryReadinessPlan;
  windows: RecoveryReadinessPlan['windows'];
  reason: string;
}

export interface ActivationResult {
  activated: boolean;
  planId: RecoveryReadinessPlan['planId'];
  acceptedDirectives: ReadinessTarget['id'][];
  blockedTargets: ReadinessTarget[];
}

export interface OrchestratorStatusResponse {
  runId: RecoveryRunId;
  state: 'idle' | 'running' | 'blocked' | 'error';
  activeTargets: number;
  notes: readonly string[];
}
