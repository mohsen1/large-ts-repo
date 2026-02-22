import type {
  RecoveryReadinessPlanDraft,
  RecoveryReadinessPlan,
  ReadinessSignal,
  ReadinessTarget,
  ReadinessDirective
} from '@domain/recovery-readiness';

export interface ReadinessPlanCommand {
  draftId: string;
  draft: RecoveryReadinessPlanDraft;
  requestedBy: string;
  requestedAt: string;
}

export interface ReadinessSignalCommand {
  signal: ReadinessSignal;
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
  acceptedDirectives: ReadinessDirective[];
  blockedTargets: ReadinessTarget[];
}
