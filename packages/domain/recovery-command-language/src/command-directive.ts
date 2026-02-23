import { z } from 'zod';
import type { CommandIntentEnvelope, PriorityBand } from './command-intent';

export type DirectiveKind =
  | 'approve'
  | 'defer'
  | 'execute'
  | 'rollback'
  | 'escalate';

export type DirectiveChannel = 'sre-console' | 'policy-engine' | 'scheduler' | 'automation';

export interface DirectiveLifecycle {
  initiatedAt: string;
  approvedAt?: string;
  executedAt?: string;
  completedAt?: string;
}

export interface CommandDirective<TPayload = Record<string, unknown>> {
  commandIntentId: string;
  kind: DirectiveKind;
  channel: DirectiveChannel;
  actor: string;
  payload: TPayload;
  priorityBand: PriorityBand;
  lifecycle: DirectiveLifecycle;
  rationale: string;
}

export const directiveSchema = z.object({
  commandIntentId: z.string().uuid(),
  kind: z.enum(['approve', 'defer', 'execute', 'rollback', 'escalate']),
  channel: z.enum(['sre-console', 'policy-engine', 'scheduler', 'automation']),
  actor: z.string().min(1),
  payload: z.record(z.unknown()),
  priorityBand: z.enum(['low', 'normal', 'high', 'critical']),
  lifecycle: z.object({
    initiatedAt: z.string().datetime(),
    approvedAt: z.string().datetime().optional(),
    executedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
  }),
  rationale: z.string().max(500),
});

export const CommandDirectiveSchema = directiveSchema;

export type CommandDirectiveEnvelope<TPayload = Record<string, unknown>> = Omit<
  CommandDirective<TPayload>,
  'lifecycle'
> & {
  lifecycle: DirectiveLifecycle;
};

export const isExecutableDirective = (directive: CommandDirective): boolean =>
  directive.kind === 'approve' || directive.kind === 'execute';

export interface CommandBundle<T extends Record<string, unknown> = Record<string, unknown>> {
  intent: CommandIntentEnvelope<T>;
  directives: CommandDirective<T>[];
  dryRun: boolean;
}

export function enrichDirective<TPayload>(
  directive: CommandDirectiveEnvelope<TPayload>,
): CommandDirectiveEnvelope<TPayload> {
  return {
    ...directive,
    actor: directive.actor.trim(),
    rationale: directive.rationale.trim(),
    payload: directive.payload,
  };
}

export function hasRollbackDirective(bundle: CommandBundle): boolean {
  return bundle.directives.some((directive) => directive.kind === 'rollback');
}
