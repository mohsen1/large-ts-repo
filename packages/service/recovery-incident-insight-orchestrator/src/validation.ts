import type { RunIncidentInsightsWithBundleInput } from './commands';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import { runIncidentInsightsWithBundleSchema } from './commands';

export const validateBundle = (input: Record<string, unknown>): Result<RunIncidentInsightsWithBundleInput, Error> => {
  const parsed = runIncidentInsightsWithBundleSchema.safeParse(input);
  if (!parsed.success) return fail(new Error('bundle-input-invalid'));
  return ok(parsed.data);
};
