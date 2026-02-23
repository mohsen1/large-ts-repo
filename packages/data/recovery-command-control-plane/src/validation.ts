import { z } from 'zod';
import { commandIntentSchema, intentContextSchema, CommandIntentEnvelope } from '@domain/recovery-command-language';
import { directiveSchema } from '@domain/recovery-command-language';

export const commandBundleSchema = z.object({
  bundleId: z.string().uuid(),
  intent: commandIntentSchema,
  context: intentContextSchema,
  directives: z.array(directiveSchema),
  createdBy: z.string().email(),
  dryRun: z.boolean(),
});

export const commandContextSchema = z.object({
  namespace: z.string().min(2),
  accountId: z.string().min(6),
  region: z.string().min(2),
});

export type CommandContext = z.infer<typeof commandContextSchema>;

export function validateIntentEnvelope(payload: unknown): payload is CommandIntentEnvelope {
  const parsed = commandIntentSchema.safeParse(payload);
  return parsed.success;
}

export function validateBundle(payload: unknown): boolean {
  return commandBundleSchema.safeParse(payload).success;
}
