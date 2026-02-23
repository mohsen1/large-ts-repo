import type { SignalPulse, SignalPlan, SignalBundle, SignalCommand } from '@domain/recovery-signal-intelligence';

export interface PipelineStep<TInput, TOutput> {
  readonly name: string;
  readonly execute: (input: TInput) => Promise<TOutput>;
}

export interface PipelineRunOutcome {
  success: boolean;
  elapsedMs: number;
  stepCount: number;
  errors: string[];
}

export const runPipeline = async <T>(
  input: T,
  steps: PipelineStep<T, T>[]
): Promise<PipelineRunOutcome> => {
  let cursor = input;
  const start = Date.now();
  const errors: string[] = [];

  for (const step of steps) {
    try {
      cursor = await step.execute(cursor);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown step failure';
      errors.push(`${step.name} failed: ${message}`);
      return {
        success: false,
        elapsedMs: Date.now() - start,
        stepCount: steps.indexOf(step) + 1,
        errors,
      };
    }
  }

  return {
    success: true,
    elapsedMs: Date.now() - start,
    stepCount: steps.length,
    errors,
  };
};

export const enrichBundle = async (bundle: SignalBundle): Promise<SignalBundle> => {
  const uniquePulseIds = new Set<string>();
  const pulses = bundle.pulses.filter((pulse) => {
    if (uniquePulseIds.has(pulse.id)) {
      return false;
    }
    uniquePulseIds.add(pulse.id);
    return true;
  });

  return { ...bundle, pulses };
};

export const validatePlan = (plan: SignalPlan): string[] => {
  const warnings: string[] = [];

  if (plan.score < 0 || plan.score > 1) {
    warnings.push('plan score must be between 0 and 1');
  }
  if (plan.actions.length === 0) {
    warnings.push('plan has no actions');
  }
  if (plan.confidence < 0.2) {
    warnings.push('low confidence plan');
  }

  return warnings;
};

export const commandLineage = (plan: SignalPlan, command: SignalCommand): string[] => {
  return [
    `tenant:${plan.tenantId}`,
    `plan:${plan.id}`,
    `command:${command.id}`,
    `state:${command.state}`,
    `windows:${plan.windows.length}`,
    `actions:${plan.actions.length}`,
  ];
};
