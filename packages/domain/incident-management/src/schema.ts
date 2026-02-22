import { z } from 'zod';
import {
  IncidentId,
  TenantId,
  ServiceId,
  OwnerId,
  IncidentSeverity,
  IncidentSource,
  IncidentState,
} from './types';

const Brand = <B extends string>(value: string, _brand: B) => value as (typeof value & { readonly __brand: B });

const incidentId = z.string().brand<'IncidentId'>();
const tenantId = z.string().brand<'TenantId'>();
const serviceId = z.string().brand<'ServiceId'>();
const ownerId = z.string().brand<'OwnerId'>();

export const IncidentInputSchema = z.object({
  id: incidentId,
  tenantId: tenantId,
  serviceId: serviceId,
  title: z.string().min(3),
  details: z.string(),
  state: z.enum(['detected', 'triaged', 'mitigating', 'monitoring', 'resolved', 'false-positive']),
  triage: z.object({
    tenantId: tenantId.transform((v): TenantId => Brand(v, 'TenantId')),
    serviceId: serviceId.transform((v): ServiceId => Brand(v, 'ServiceId')),
    observedAt: z.string(),
    source: z.enum(['alert', 'slo', 'customer', 'ops-auto', 'security-posture'] as const),
    severity: z.enum(['sev1', 'sev2', 'sev3', 'sev4'] as const),
    labels: z.array(z.object({ key: z.string(), value: z.string() })),
    confidence: z.number().min(0).max(1),
    signals: z.array(
      z.object({
        name: z.string(),
        value: z.number(),
        unit: z.enum(['count', 'percent', 'seconds', 'ms']),
        at: z.string(),
      }),
    ),
  }),
  currentStep: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
  runbook: z
    .object({
      id: z.string().brand<'RunbookId'>(),
      tenantId: tenantId.transform((v): TenantId => Brand(v, 'TenantId')),
      name: z.string(),
      owner: ownerId.transform((v): OwnerId => Brand(v, 'OwnerId')),
      appliesTo: z.array(z.enum(['sev1', 'sev2', 'sev3', 'sev4'] as const)),
      steps: z.array(
        z.object({
          key: z.string(),
          title: z.string(),
          automation: z.enum(['safety', 'rollback', 'drain', 'scale', 'notify', 'investigate']),
          state: z.enum(['pending', 'running', 'done', 'skipped', 'failed']),
          estimateSeconds: z.number().min(0),
          action: z.object({
            key: z.string(),
            description: z.string(),
            owner: ownerId.optional().transform((value): OwnerId | undefined =>
              value ? (Brand(value, 'OwnerId') as OwnerId) : undefined,
            ),
            requiresManualApproval: z.boolean(),
            timeoutSeconds: z.number().min(1),
            config: z.record(z.unknown()).optional(),
          }),
          prerequisites: z.array(z.string()),
        }),
      ),
      tags: z.array(z.string()),
    })
    .optional(),
});

export type ParsedIncidentInput = z.infer<typeof IncidentInputSchema>;

export const parseIncident = (value: unknown): { ok: true; value: ParsedIncidentInput } | { ok: false; error: z.ZodError } => {
  const parsed = IncidentInputSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error };
  return { ok: true, value: parsed.data };
};

export const castIncidentId = (value: string): IncidentId => Brand(value, 'IncidentId');

const typed: { [K in IncidentSeverity]: K } = {
  sev1: 'sev1',
  sev2: 'sev2',
  sev3: 'sev3',
  sev4: 'sev4',
};

export const asIncidentState = (value: string): IncidentState | undefined => {
  return (['detected', 'triaged', 'mitigating', 'monitoring', 'resolved', 'false-positive'] as const).find(
    (state): state is IncidentState => state === value,
  ) as IncidentState | undefined;
};

export const parseSeverity = (value: string): IncidentSeverity | undefined => typed[value as IncidentSeverity];
