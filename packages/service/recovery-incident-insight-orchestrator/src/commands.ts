import { z } from 'zod';
import type { IncidentId, SignalBundle, TenantId } from '@domain/recovery-incident-insights/src';
import { signalBundleSchema } from '@domain/recovery-incident-insights/src';

const toTenantId = (value: string): TenantId => value as TenantId;
const toIncidentId = (value: string): IncidentId => value as IncidentId;

export const runIncidentInsightsInputSchema = z.object({
  runId: z.string().min(3),
  tenantId: z.string().min(1).transform((value) => toTenantId(value)),
  incidentId: z.string().min(1).transform((value) => toIncidentId(value)),
  candidateWindowMinutes: z.number().int().positive().max(480).default(60),
  runForecast: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

export const runIncidentInsightsWithBundleSchema = runIncidentInsightsInputSchema.extend({
  bundle: signalBundleSchema,
});

export type RunIncidentInsightsInput = z.infer<typeof runIncidentInsightsInputSchema>;
export type RunIncidentInsightsWithBundleInput = z.infer<typeof runIncidentInsightsWithBundleSchema>;

export interface RunResult {
  readonly runId: string;
  readonly tenantId: TenantId;
  readonly bundleId: string;
  readonly forecastId?: string;
  readonly readinessState: string;
  readonly policyDecisions: number;
  readonly notified: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
}
