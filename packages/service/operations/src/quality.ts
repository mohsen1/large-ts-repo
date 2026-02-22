import { z } from 'zod';
import { checkCharset, checkLength, pass, QualityConfig } from '@service/quality';
import { Severity, OperationSignal } from '@domain/operations-orchestration';
import { OperationsInputPayload, OperationsCommand } from './models';

export const operationRequestSchema = z.object({
  tenantId: z.string().min(1),
  deploymentId: z.string().min(1),
  runbookId: z.string().min(1),
  severity: z.enum(['none', 'minor', 'major', 'critical']),
  requestedBy: z.string().min(1),
  window: z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    kind: z.enum(['maintenance', 'freeze', 'safety', 'recovery']),
  }),
  tags: z.array(z.string()).optional(),
});

export const validateRequest = (value: OperationsInputPayload | OperationsCommand | unknown) => {
  const parsed = operationRequestSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues } as const;
  }
  return { ok: true, value: parsed.data } as const;
};

export interface QualityAssessment {
  passed: boolean;
  reason: string;
  quality: number;
}

const severityWeight: Record<Severity, number> = {
  none: 1,
  minor: 2,
  major: 4,
  critical: 8,
};

export const assessQuality = (command: OperationsInputPayload): QualityAssessment => {
  const checks = pass(command.deploymentId, { minScore: 60 }) && pass(command.runbookId, { minScore: 70 });
  const score =
    checkLength(command.requestedBy, 4).score +
    checkCharset(command.requestedBy).score +
    severityWeight[command.severity] * 4 +
    Math.max(0, 20 - command.signals.length * 2);
  return {
    passed: checks,
    reason: checks ? 'passed baseline quality checks' : 'failed baseline quality checks',
    quality: score,
  };
};
