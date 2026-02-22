import { Brand } from '@shared/core';
import { Merge } from '@shared/type-level';
import { z } from 'zod';

export type ControlRunId = Brand<string, 'ControlRunId'>;
export type ControlPolicyId = Brand<string, 'ControlPolicyId'>;
export type ControlSignalId = Brand<string, 'ControlSignalId'>;

export type WindowState = 'draft' | 'active' | 'throttled' | 'completed' | 'failed';

export type RiskBand = 'green' | 'amber' | 'red' | 'critical';

export interface ControlSpan {
  from: string;
  to: string;
  owner: string;
  region: string;
}

export interface DependencyEdge {
  from: Brand<string, 'SystemId'>;
  to: Brand<string, 'SystemId'>;
  criticality: number;
}

export interface ControlPolicySettings {
  maxRetries: number;
  timeoutSeconds: number;
  concurrencyCap: number;
  allowedModes: readonly WindowState[];
  riskFloor: RiskBand;
}

export interface ControlStep<TContext extends Record<string, unknown> = Record<string, unknown>> {
  key: Brand<string, 'ControlStepKey'>;
  name: string;
  action: string;
  timeoutMs: number;
  dependencies: readonly Brand<string, 'ControlStepKey'>[];
  tags: readonly string[];
  context: TContext;
}

export interface ControlTemplate<TContext extends Record<string, unknown> = Record<string, unknown>> {
  id: ControlPolicyId;
  name: string;
  owner: string;
  description: string;
  windows: readonly ControlSpan[];
  defaultSettings: ControlPolicySettings;
  steps: readonly ControlStep<TContext>[];
}

export interface ControlRunPlan<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  id: ControlRunId;
  policyId: ControlPolicyId;
  tenantId: Brand<string, 'TenantId'>;
  requestId: Brand<string, 'OperationsRequestId'>;
  state: WindowState;
  effectiveWindow: ControlSpan;
  steps: readonly ControlStep<TMetadata>[];
  edges: readonly DependencyEdge[];
  signals: readonly ControlSignal[];
  metadata: TMetadata;
}

export interface ControlSignal<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: ControlSignalId;
  name: string;
  source: string;
  weight: number;
  severity: number;
  observedAt: string;
  payload?: TPayload;
}

export interface PolicyEvaluation {
  policyId: ControlPolicyId;
  allowed: boolean;
  reasons: readonly string[];
  riskBand: RiskBand;
}

export interface ControlForecast {
  window: Pick<ControlSpan, 'from' | 'to'>;
  concurrency: number;
  latencyEstimateMs: number;
}

export interface PolicyEnvelope<TSchema extends Record<string, unknown> = Record<string, unknown>> {
  readonly policy: ControlTemplate<TSchema>;
  readonly controls: readonly {
    stepKey: ControlStep['key'];
    selected: boolean;
    priority: number;
  }[];
}

export type PlanEnvelope<TMetadata extends Record<string, unknown>, TOverrides extends Record<string, unknown> = Record<string, unknown>> = Merge<
  ControlRunPlan<TMetadata>,
  {
    overrides: Partial<TOverrides>;
  }
>;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const normalizeControlWindow = (span: ControlSpan): ControlSpan => ({
  ...span,
  from: new Date(span.from).toISOString(),
  to: new Date(span.to).toISOString(),
});

export const normalizeRisk = (riskBand: RiskBand): RiskBand => (riskBand ?? 'green') as RiskBand;

export const buildSignalScore = <TPayload extends Record<string, unknown>>(signals: readonly ControlSignal<TPayload>[]): number => {
  const now = Date.now();
  return signals.reduce((total, signal) => {
    const age = now - Date.parse(signal.observedAt || new Date(0).toISOString());
    const agePenalty = Math.min(50, age / 1000);
    const severity = Number(signal.severity);
    const weight = Number.isFinite(severity) ? severity : 0;
    return total + Math.max(0, weight * Math.max(0.5, signal.weight)) - agePenalty;
  }, 0);
};

export const estimateRiskBand = (signals: readonly ControlSignal[], retries: number): RiskBand => {
  const score = clamp(buildSignalScore(signals) - retries * 2, -100, 200);
  if (score < 30) return 'green';
  if (score < 80) return 'amber';
  if (score < 140) return 'red';
  return 'critical';
};

export const summarizePolicy = (template: ControlTemplate): string =>
  `${template.id}@${template.owner} steps=${template.steps.length} windows=${template.windows.length}`;

export const asPolicyId = (value: string): ControlPolicyId => value as ControlPolicyId;
export const asControlSignalId = (value: string): ControlSignalId => value as ControlSignalId;
export const asControlRunId = (value: string): ControlRunId => value as ControlRunId;

export const hasAllowedWindow = (allowedModes: readonly WindowState[], state: WindowState): boolean =>
  allowedModes.includes(state);

export const controlPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  owner: z.string().min(1),
  description: z.string().max(300).optional().default(''),
  windows: z.array(
    z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
      owner: z.string().min(1),
      region: z.string().min(1),
    }),
  ).min(1),
  defaultSettings: z.object({
    maxRetries: z.number().int().min(0),
    timeoutSeconds: z.number().int().min(1),
    concurrencyCap: z.number().int().min(1),
    allowedModes: z.array(z.enum(['draft', 'active', 'throttled', 'completed', 'failed'])),
    riskFloor: z.enum(['green', 'amber', 'red', 'critical']),
  }),
  steps: z.array(
    z.object({
      key: z.string().min(1),
      name: z.string().min(1),
      action: z.string().min(1),
      timeoutMs: z.number().int().min(1),
      dependencies: z.array(z.string()).default([]),
      tags: z.array(z.string()),
      context: z.record(z.unknown()),
    }),
  ),
});
