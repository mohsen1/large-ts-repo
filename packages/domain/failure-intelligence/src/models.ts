import { Brand, withBrand } from '@shared/core';
import { type NonEmptyArray, type Primitive } from '@shared/type-level';

export type Severity = 'p0' | 'p1' | 'p2' | 'p3';
export type SignalShape = 'latency' | 'error-rate' | 'availability' | 'capacity' | 'security';

export type SignalSource = Brand<string, 'SignalSource'>;
export type FailureSignalId = Brand<string, 'FailureSignalId'>;

export interface SignalTag<T extends string = string> {
  name: T;
  confidence: number;
}

export interface FailureSignalInput {
  source: string;
  tenantId: Brand<string, 'TenantId'>;
  shape: SignalShape;
  component: string;
  severity: Severity;
  message: string;
  context: {
    region: string;
    environment: 'prod' | 'staging' | 'canary';
    service: string;
    host?: string;
    owner?: string;
  };
  payload: Record<string, Primitive>;
  occurredAt?: string;
}

export interface FailureSignal {
  id: FailureSignalId;
  source: SignalSource;
  tenantId: Brand<string, 'TenantId'>;
  shape: SignalShape;
  component: string;
  severity: Severity;
  message: string;
  context: FailureSignalInput['context'];
  payload: Record<string, Primitive>;
  createdAt: string;
  occurredAt: string;
  history: readonly number[];
  tags: NonEmptyArray<string> | readonly string[];
}

export interface FailurePlanAction {
  id: Brand<string, 'FailurePlanActionId'>;
  action: 'mitigate' | 'isolate' | 'throttle' | 'patch' | 'fallback' | 'page' | 'ignore';
  reason: string;
  confidence: number;
  runbook?: string;
  args?: Record<string, Primitive>;
}

export type PlanRisk = 'low' | 'moderate' | 'high' | 'critical';
export type NewFailureSignal = Omit<FailureSignalInput, 'tenantId'> & {
  tenantId: Brand<string, 'TenantId'>;
};

export interface IncidentFingerprint {
  tenantId: Brand<string, 'TenantId'>;
  component: string;
  rootCause: string;
  score: number;
  severity: PlanRisk;
}

export interface FailureActionPlan {
  id: Brand<string, 'FailurePlanId'>;
  tenantId: Brand<string, 'TenantId'>;
  signalIds: FailureSignalId[];
  fingerprint: IncidentFingerprint;
  actions: FailurePlanAction[];
  owner?: string;
  createdAt: string;
  expiresAt: string;
}

export const normalizeSeverity = (value: Severity): number =>
  value === 'p0' ? 4 : value === 'p1' ? 3 : value === 'p2' ? 2 : 1;

export interface PolicyDecision {
  ruleId: string;
  reason: string;
  risk: PlanRisk;
  confidence: number;
  actions: ReadonlyArray<{ name: FailurePlanAction['action']; confidence: number }>;
}

export interface GraphSignalLink {
  from: FailureSignalId;
  to: FailureSignalId;
  weight: number;
}

export const severityWeight = (value: Severity): number =>
  value === 'p0' ? 4 : value === 'p1' ? 3 : value === 'p2' ? 2 : 1;

export const createFailureSignalIdentity = (input: FailureSignalInput): FailureSignalId => {
  const raw = `${input.tenantId}:${input.component}:${input.shape}:${Date.now()}`;
  return withBrand(raw, 'FailureSignalId');
};

export const createSignalIdentity = (input: NewFailureSignal): FailureSignalId =>
  createFailureSignalIdentity(input as unknown as FailureSignalInput);

export const createSignalTags = (severity: Severity, shape: SignalShape, component: string): SignalTag[] => {
  const score = severityWeight(severity);
  return [
    { name: `${shape}:severity`, confidence: score / 4 },
    { name: `component:${component}`, confidence: 1 },
    { name: 'tenant-scoped', confidence: 1 },
  ];
};
