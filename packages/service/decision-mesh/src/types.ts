import { Brand, normalizeLimit, ReadonlyDeep } from '@shared/core';
import { type DecisionPolicyTemplate } from '@data/decision-catalog';

export type MeshTenantId = Brand<string, 'MeshTenantId'>;
export type MeshRequestId = Brand<string, 'MeshRequestId'>;
export type MeshTraceId = Brand<string, 'MeshTraceId'>;

export type PriorityBand = 'low' | 'normal' | 'high' | 'critical';
export type PolicySelectionMode = 'deterministic' | 'weighted' | 'canary';

export interface DecisionMeshRequest<TContext = Record<string, unknown>> {
  tenantId: string;
  subjectId: string;
  policyId: string;
  requestedBy: string;
  context: TContext;
  priority: number;
  mode: PolicySelectionMode;
}

export interface DecisionMeshEnvelope<TContext = Record<string, unknown>> {
  requestId: MeshRequestId;
  tenantId: MeshTenantId;
  traceId: MeshTraceId;
  request: DecisionMeshRequest<TContext>;
  acceptedAt: string;
}

export interface DecisionMeshResult {
  requestId: MeshRequestId;
  tenantId: MeshTenantId;
  policyId: string;
  selectedActors: string;
  risk: 'low' | 'medium' | 'high';
  runtimeMs: number;
  policyVersion: string;
  traceId: MeshTraceId;
}

export interface PolicyMeta {
  policyId: string;
  tenantId: string;
  active: boolean;
  version: string;
  weight: number;
  expiresAt?: string;
}

export interface PolicyBundle {
  template: DecisionPolicyTemplate;
  meta: PolicyMeta;
}

export interface MeshErrorContext {
  requestId: MeshRequestId;
  at: string;
  message: string;
  details?: ReadonlyDeep<Record<string, unknown>>;
}

export interface RankedCandidate<TValue> {
  value: TValue;
  rank: number;
  score: number;
}

export interface PolicyWeights {
  tenantFactor: number;
  priorityFactor: number;
  policyDensityFactor: number;
}

export interface MeshPageArgs {
  cursor?: string;
  limit: number;
  tenantId?: string;
}

export interface MeshPageResponse<T> {
  items: ReadonlyArray<T>;
  cursor?: string;
  hasMore: boolean;
  total: number;
}

export type NonEmpty<T> = T extends [] ? never : [T[keyof T], ...T[]];

export const normalizePriority = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  if (value <= 0) return 1;
  if (value >= 10) return 10;
  return Math.round(value);
};

export const priorityBand = (priority: number): PriorityBand => {
  if (priority >= 9) return 'critical';
  if (priority >= 7) return 'high';
  if (priority >= 4) return 'normal';
  return 'low';
};

export const sanitizeTenantId = (tenantId: string): MeshTenantId => tenantId.trim().toLowerCase() as MeshTenantId;
export const nextRequestId = (): MeshRequestId => `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}` as MeshRequestId;

export const createPolicyMeta = (template: DecisionPolicyTemplate, weight: number) => ({
  policyId: template.id,
  tenantId: template.tenantId.toLowerCase(),
  active: template.active,
  version: template.version,
  weight,
  expiresAt: template.tags?.expiry ?? undefined,
});

export const clampPage = (args: MeshPageArgs): MeshPageArgs => ({
  ...args,
  limit: normalizeLimit(args.limit),
  tenantId: args.tenantId?.trim(),
});
