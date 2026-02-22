import { z } from 'zod';

import type { RecoveryProgram } from '@domain/recovery-orchestration';

export const RecoveryCommand = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    requestedBy: z.string().min(1),
    correlationId: z.string().min(1),
    dryRun: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('close'),
    runId: z.string().min(1),
    requestedBy: z.string().min(1),
  }),
  z.object({
    type: z.literal('status'),
    runId: z.string().min(1),
    requestedBy: z.string().min(1),
  }),
]);

export type RecoveryCommand = z.infer<typeof RecoveryCommand>;

export interface RecoveryBootstrap {
  program: RecoveryProgram;
  command: RecoveryCommand;
}
