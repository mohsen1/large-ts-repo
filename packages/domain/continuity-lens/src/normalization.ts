import { z } from 'zod';

import type { ContinuityPolicy, ContinuitySignal, LensRiskLevel, LensSignalState, ContinuityTenantId, ContinuityDimension, ContinuitySignalMetric } from './types';
import { withBrand } from '@shared/core';

const timestampSchema = z.string().datetime();
const brandType = z.string().min(1);

const lensRiskSchema = z.enum(['low', 'medium', 'high', 'critical']);
const lensScopeSchema = z.enum(['service', 'region', 'provider', 'tenant']);
const lensStateSchema = z.enum(['detected', 'queued', 'correlated', 'resolved']);

const rawDimensionSchema = z.object({
  dimension: lensScopeSchema,
  key: z.string().min(1),
  value: z.string(),
});

const rawMetricSchema = z.object({
  metricName: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  source: z.string().min(1),
  observedAt: timestampSchema,
});

const rawSignalSchema = z.object({
  tenantId: brandType,
  zone: z.string().min(1),
  service: z.string().min(1),
  component: z.string().min(1),
  state: lensStateSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.number().min(0).max(100),
  risk: lensRiskSchema,
  scope: lensScopeSchema,
  tags: z.array(z.string()).default([]),
  reportedAt: timestampSchema,
  dimensions: z.array(rawDimensionSchema),
  metrics: z.array(rawMetricSchema),
});

export type RawSignalInput = z.input<typeof rawSignalSchema>;

const normalizeRisk = (value: number): LensRiskLevel => {
  if (value >= 85) return 'critical';
  if (value >= 65) return 'high';
  if (value >= 35) return 'medium';
  return 'low';
};

const clamp = (value: number, min: number, max: number): number =>
  Number(Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)).toFixed(4));

export interface SignalEnvelope {
  readonly tenantId: ContinuityTenantId;
  readonly zone: string;
  readonly service: string;
  readonly component: string;
  readonly state: LensSignalState;
  readonly title: string;
  readonly description: string;
  readonly severity: number;
  readonly risk: LensRiskLevel;
  readonly scope: typeof rawSignalSchema.shape.scope._type;
  readonly tags: readonly string[];
  readonly reportedAt: string;
  readonly dimensions: readonly typeof rawDimensionSchema._type[];
  readonly metrics: readonly typeof rawMetricSchema._type[];
}

export const normalizeSignalEnvelope = (input: RawSignalInput): SignalEnvelope => {
  const parsed = rawSignalSchema.parse(input);
  const tags = parsed.tags.map((tag: string) => tag.toLowerCase().trim()).filter(Boolean);
  const severity = clamp(parsed.severity, 0, 100);
  const risk = normalizeRisk(Math.max(parsed.severity, severity));
  return {
    ...parsed,
    tenantId: withBrand(parsed.tenantId, 'ContinuityTenantId'),
    service: parsed.service,
    component: parsed.component,
    severity,
    tags,
    risk,
      dimensions: parsed.dimensions.map((metric: ContinuityDimension) => ({
        ...metric,
      })) as readonly ContinuityDimension[],
      metrics: parsed.metrics.map((metric: ContinuitySignalMetric) => ({
        ...metric,
        value: clamp(metric.value, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      })) as readonly ContinuitySignalMetric[],
    };
};

const policyStringSchema = z.string().min(3);
const policySchema = z.object({
  tenantId: brandType,
  name: z.string().min(3),
  criticalityThreshold: z.number().min(0).max(100),
  minimumSeverity: z.number().min(0).max(100),
  allowAutoMitigation: z.boolean().default(false),
  maxConcurrency: z.number().int().min(1).max(100),
});

export const normalizePolicy = (input: unknown): ContinuityPolicy => {
  const parsed = policySchema.parse(input);
  return {
    id: withBrand(`${parsed.tenantId}:policy:${parsed.name}`, 'ContinuityPolicyId'),
    tenantId: withBrand(parsed.tenantId, 'ContinuityTenantId'),
    name: parsed.name,
    criticalityThreshold: clamp(parsed.criticalityThreshold, 0, 100),
    minimumSeverity: clamp(parsed.minimumSeverity, 0, 100),
    allowAutoMitigation: parsed.allowAutoMitigation ?? false,
    maxConcurrency: Math.max(1, parsed.maxConcurrency),
  };
};

export const signalMatchesPolicy = (signal: ContinuitySignal, policy: ContinuityPolicy): boolean =>
  signal.tenantId === policy.tenantId &&
  signal.severity >= policy.minimumSeverity &&
  signal.risk !== 'low';

export const canonicalSignalId = (tenantId: string, service: string, source: string): string =>
  `${tenantId}:${service}:${source}`;
