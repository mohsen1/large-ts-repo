import { z } from 'zod';

import { parseRecoveryProgram } from './schema';
import type { RecoveryProgram, RecoveryRunState } from './types';

const ProgramInputSchema = z.object({
  program: z.unknown(),
  runState: z.object({
    runId: z.string(),
    programId: z.string(),
    incidentId: z.string(),
    status: z.enum(['draft', 'staging', 'running', 'completed', 'aborted', 'failed']),
    estimatedRecoveryTimeMinutes: z.number().nonnegative(),
  }),
});

export interface ProgramValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly program: RecoveryProgram | null;
}

export const validateRecoveryProgramInput = (
  input: unknown,
): ProgramValidationResult => {
  const parsed = ProgramInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.errors.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      program: null,
    };
  }
  const program = parseRecoveryProgram(parsed.data.program);
  return { ok: true, errors: [], program };
};

export interface RunViabilityCheck {
  readonly program: RecoveryProgram;
  readonly runState: RecoveryRunState;
}

export const validateRunReadiness = ({ program, runState }: RunViabilityCheck): boolean =>
  program.steps.length > 0 &&
  runState.status !== 'completed' &&
  program.window.startsAt < program.window.endsAt &&
  program.steps.every((step) => step.timeoutMs > 0);
