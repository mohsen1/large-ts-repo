import { z } from 'zod';
import type { TenantId } from '@domain/recovery-incident-insights/src';
import { signalBundleSchema } from '@domain/recovery-incident-insights/src';

export const runIncidentInsightsInputSchema = z.object({
  runId: z.string().min(3),
  tenantId: z.string().min(1),
  incidentId: z.string().min(1),
  candidateWindowMinutes: z.number().int().positive().max(480).default(60),
  runForecast: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

export const runIncidentInsightsWithBundleSchema = z.object({
  ...runIncidentInsightsInputSchema.shape,
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
