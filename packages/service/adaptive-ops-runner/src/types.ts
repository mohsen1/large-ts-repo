import { AdaptiveDecision, AdaptiveRun, AdaptiveAction, AdaptivePolicy, SignalSample } from '@domain/adaptive-ops';

export type RunnerErrorCode = 'policy-parse' | 'storage' | 'publish' | 'invalid';

export interface RunnerContext {
  tenantId: string;
  signalWindowSec: number;
  policies: readonly AdaptivePolicy[];
}

export interface RunnerInput {
  context: RunnerContext;
  signals: readonly SignalSample[];
}

export interface RunnerResult {
  run: AdaptiveRun;
  decisions: readonly AdaptiveDecision[];
  firstAction: AdaptiveAction | null;
}

export interface RunnerStatus {
  ok: boolean;
  code: RunnerErrorCode | 'ok';
  message: string;
}
