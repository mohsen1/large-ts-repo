import { z } from 'zod';
import { parseRecoveryPlaybook } from '@domain/recovery-playbook-orchestration';
import type { PlaybookRunCommand } from './types';

export const runCommandSchema = z.object({
  workspaceId: z.string().min(1),
  tenant: z.object({
    tenantId: z.string().min(1),
    region: z.string().min(1),
    environment: z.enum(['prod', 'staging', 'sandbox']),
  }),
  playbook: z.unknown(),
  signals: z.array(z.object({
    id: z.string(),
    signal: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    tags: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    capturedAt: z.string(),
    evidence: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(['telemetry', 'slo', 'policy', 'agent']),
        summary: z.string(),
        payload: z.record(z.string(), z.unknown()),
      }),
    ),
  })),
  options: z
    .object({
      planningMode: z.enum(['dry-run', 'canary', 'full']).optional(),
      enforcePolicy: z.boolean().optional(),
      parallelismLimit: z.number().int().positive().optional(),
      enableWarnings: z.boolean().optional(),
    })
    .optional(),
});

export const validateRunCommand = (command: PlaybookRunCommand): boolean => {
  runCommandSchema.parse({
    workspaceId: command.workspaceId,
    tenant: command.tenant,
    playbook: command.playbook,
    signals: command.signals,
    options: command.options,
  });
  parseRecoveryPlaybook(command.playbook);
  return true;
};
