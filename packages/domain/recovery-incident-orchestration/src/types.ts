import { z } from 'zod';
import type { Brand, Merge, Prettify } from '@shared/type-level';
import { withBrand } from '@shared/core';

export const severityBands = ['low', 'medium', 'high', 'critical', 'extreme'] as const;

export type SeverityBand = (typeof severityBands)[number];

export const incidentTimestamps = {
  openedAt: z.string().datetime(),
  detectedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
} as const;

export type IncidentId = Brand<string, 'IncidentId'>;
export type WorkItemId = Brand<string, 'WorkItemId'>;
export type RouteId = Brand<string, 'RouteId'>;
export type IncidentPlanId = Brand<string, 'IncidentPlanId'>;

export interface IncidentScope {
  readonly tenantId: string;
  readonly clusterId: string;
  readonly region: string;
  readonly serviceName: string;
}

export interface IncidentSignal {
  readonly name: string;
  readonly value: number;
  readonly threshold: number;
  readonly observedAt: string;
  readonly metadata: Record<string, string>;
}

export interface RecoveryWorkItem {
  readonly id: WorkItemId;
  readonly name: string;
  readonly owner: string;
  readonly command: string;
  readonly estimatedMinutes: number;
  readonly constraints: readonly string[];
}

export interface IncidentSnapshot {
  readonly scope: IncidentScope;
  readonly severity: SeverityBand;
  readonly score: number;
  readonly indicators: readonly IncidentSignal[];
  readonly affectedServices: readonly string[];
}

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly intervalMinutes: number;
  readonly backoffMultiplier: number;
}

export interface RecoveryPlay {
  readonly id: WorkItemId;
  readonly label: string;
  readonly command: string;
  readonly parameters: Record<string, unknown>;
  readonly timeoutMinutes: number;
  readonly retryPolicy: RetryPolicy;
}

export interface RecoveryRouteNode {
  readonly id: WorkItemId;
  readonly dependsOn: readonly WorkItemId[];
  readonly play: RecoveryPlay;
}

export interface RecoveryRoute {
  readonly id: RouteId;
  readonly incidentId: IncidentId;
  readonly nodes: readonly RecoveryRouteNode[];
  readonly createdAt: string;
  readonly owner: string;
}

export interface OrchestrationPlan {
  readonly id: IncidentPlanId;
  readonly incidentId: IncidentId;
  readonly title: string;
  readonly windows: readonly SchedulerWindow[];
  readonly route: RecoveryRoute;
  readonly metadata: Record<string, string>;
}

export interface IncidentPlan extends OrchestrationPlan {
  readonly riskScore: number;
  readonly approved: boolean;
}

export interface IncidentRecord {
  readonly id: IncidentId;
  readonly title: string;
  readonly scope: IncidentScope;
  readonly severity: SeverityBand;
  readonly summary: string;
  readonly labels: readonly string[];
  readonly openedAt: string;
  readonly detectedAt: string;
  readonly resolvedAt?: string;
  readonly snapshots: readonly IncidentSnapshot[];
  readonly signals: readonly IncidentSignal[];
  readonly metadata: Record<string, unknown>;
}

export interface RecoveryContext {
  readonly incidentId: IncidentId;
  readonly snapshot: IncidentSnapshot;
  readonly previousPlanIds: readonly IncidentPlanId[];
}

export interface IncidentCommand {
  readonly type: 'triage' | 'stabilize' | 'mitigate' | 'verify' | 'close';
  readonly target: IncidentId;
  readonly payload: Record<string, unknown>;
  readonly requestedBy: string;
  readonly requestedAt: string;
}

export interface IncidentEvent {
  readonly id: Brand<string, 'IncidentEventId'>;
  readonly incidentId: IncidentId;
  readonly type: 'created' | 'updated' | 'plan_added' | 'plan_approved' | 'resolved' | 'escalated';
  readonly details: Record<string, unknown>;
  readonly createdAt: string;
}

export interface SchedulerWindow {
  readonly startAt: string;
  readonly endAt: string;
  readonly timezone: string;
}

export interface OrchestrationRun {
  readonly id: Brand<string, 'RunId'>;
  readonly planId: IncidentPlanId;
  readonly nodeId: WorkItemId;
  readonly state: 'pending' | 'running' | 'done' | 'failed';
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly output: Record<string, unknown>;
}

export const incidentSchema = z.object({
  id: z.string(),
  title: z.string().min(3),
  severity: z.enum(severityBands),
  summary: z.string().max(400),
  openedAt: incidentTimestamps.openedAt,
  detectedAt: incidentTimestamps.detectedAt,
});

export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(0).max(10),
  intervalMinutes: z.number().int().min(1),
  backoffMultiplier: z.number().min(1),
});

export const workItemSchema = z.object({
  name: z.string(),
  owner: z.string(),
  command: z.string(),
  estimatedMinutes: z.number().min(1),
  constraints: z.array(z.string()),
  retryPolicy: retryPolicySchema,
});

export const recoveryEventSchema = z.object({
  incidentId: z.string(),
  type: z.enum(['created', 'updated', 'plan_added', 'plan_approved', 'resolved', 'escalated']),
  details: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

export const buildRouteId = (incidentId: IncidentId, index: number): RouteId =>
  withBrand(`${incidentId}:route-${index}`, 'RouteId');

export const buildWorkItemId = (planId: IncidentPlanId, stepIndex: number, command: string): WorkItemId =>
  withBrand(`${planId}:work:${stepIndex}:${command}`, 'WorkItemId');

export const buildPlanId = (incidentId: IncidentId): IncidentPlanId =>
  withBrand(`${incidentId}:plan-${Date.now()}`, 'IncidentPlanId');

export type RouteCoverage = {
  readonly completed: readonly WorkItemId[];
  readonly remaining: readonly WorkItemId[];
};

export type RouteGraph = {
  readonly nodes: readonly RecoveryRouteNode[];
  readonly edges: readonly [WorkItemId, WorkItemId][];
};

export const createScopedIncident = (raw: { incidentId: string; tenantId: string; clusterId: string }): IncidentScope => ({
  tenantId: raw.tenantId,
  clusterId: raw.clusterId,
  region: 'us-east-1',
  serviceName: `service:${raw.incidentId}`,
});

export type RouteNodeSelection<T extends RecoveryRouteNode = RecoveryRouteNode> =
  (item: T) => boolean;

export const filterRouteNodes = <T extends RecoveryRouteNode>(
  nodes: readonly T[],
  selector: RouteNodeSelection<T>,
): readonly T[] => nodes.filter(selector);

export type RouteBuildOptions = Prettify<
  Merge<{
    includeSimulationOnly: boolean;
    maxAttempts: number;
    batchSize: number;
  }, {
    windowMinutes: number;
    parallelism: number;
  }>
>;

export const defaultRouteOptions: RouteBuildOptions = {
  includeSimulationOnly: false,
  maxAttempts: 3,
  batchSize: 4,
  windowMinutes: 30,
  parallelism: 2,
};
