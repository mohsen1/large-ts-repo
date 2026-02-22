import { normalizeProgram, summarizeProgram } from '@domain/recovery-orchestration';
import type {
  RecoveryProgram,
  RecoveryRunState,
} from '@domain/recovery-orchestration';

export interface OrchestrationPolicy {
  readonly allowEmergencyPriority: boolean;
  readonly maxRunWindowMinutes: number;
  readonly minCompletedThreshold: number;
}

export interface OrchestrationDecision {
  readonly approved: boolean;
  readonly rationale: readonly string[];
  readonly runState: RecoveryRunState;
}

const defaultPolicy: OrchestrationPolicy = {
  allowEmergencyPriority: true,
  maxRunWindowMinutes: 480,
  minCompletedThreshold: 0.1,
};

export const evaluateProgramPolicy = (
  program: RecoveryProgram,
  runState: RecoveryRunState,
  policy: Partial<OrchestrationPolicy> = {},
): OrchestrationDecision => {
  const effectivePolicy = { ...defaultPolicy, ...policy };
  const normalizedProgram = normalizeProgram(program);
  const projection = summarizeProgram(normalizedProgram);
  const issues: string[] = [];

  const windowMinutes = new Date(program.window.endsAt).getTime() - new Date(program.window.startsAt).getTime();
  if (windowMinutes <= 0 || windowMinutes / 60000 > effectivePolicy.maxRunWindowMinutes) {
    issues.push('window-exceeds-policy');
  }

  if (program.priority === 'platinum' && !effectivePolicy.allowEmergencyPriority) {
    issues.push('policy-disallows-platinum');
  }
  if (projection.stepCount > 0 && runState.estimatedRecoveryTimeMinutes < effectivePolicy.minCompletedThreshold * projection.stepCount) {
    issues.push('run-time-unrealistic');
  }
  return {
    approved: issues.length === 0,
    rationale: issues,
    runState,
  };
};

export const describeProgram = (program: RecoveryProgram): string => {
  const projection = summarizeProgram(program);
  return `${projection.name} [${projection.priority}/${projection.mode}] steps=${projection.stepCount} constraints=${projection.hasBlockingConstraints ? 'yes' : 'no'}`;
};

export const policyGuardrailReport = (program: RecoveryProgram): readonly { key: string; value: string }[] => {
  const projection = summarizeProgram(program);
  return [
    { key: 'priority', value: projection.priority },
    { key: 'mode', value: projection.mode },
    { key: 'steps', value: String(projection.stepCount) },
    { key: 'services', value: String(projection.serviceCount) },
  ];
};
