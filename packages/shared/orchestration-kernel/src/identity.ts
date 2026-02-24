import { withBrand } from '@shared/core';
import type { Branded } from './types';

export type OrchestratorId = Branded<string, 'OrchestratorId'>;
export type WorkspaceId = Branded<string, 'WorkspaceId'>;
export type WorkloadId = Branded<string, 'WorkloadId'>;
export type PlanId = Branded<string, 'PlanId'>;
export type PluginId = Branded<string, 'PluginId'>;
export type RunId = Branded<string, 'RunId'>;
export type StreamToken = Branded<string, 'StreamToken'>;
export type EventId = Branded<string, 'EventId'>;
export type PhaseName = 'discovery' | 'triage' | 'mitigation' | 'recovery' | 'verification' | 'closure';
export type Severity = 'notice' | 'warning' | 'critical' | 'blocked';
export type HealthState = 'unknown' | 'healthy' | 'degraded' | 'critical';
export type PolicyTag = `policy:${string}`;
export type RouteKey<T extends string = string> = `route:${T}`;

export interface TemporalWindow {
  readonly from: number;
  readonly to: number;
}

export type NamespaceToken<T extends string = string> = `${T}:${string}`;

export interface TimelineStamp {
  readonly orchestratorId: OrchestratorId;
  readonly workspaceId: WorkspaceId;
  readonly tenant: string;
  readonly phase: PhaseName;
  readonly token: StreamToken;
}

export interface TimelineCursor {
  readonly workspaceId: WorkspaceId;
  readonly planId: PlanId;
  readonly segment: number;
}

export interface RuntimeEnvelope {
  readonly id: RunId;
  readonly orchestratorId: OrchestratorId;
  readonly workspaceId: WorkspaceId;
  readonly planId: PlanId;
  readonly startedAt: string;
  readonly expiresAt?: string;
  readonly phases: readonly PhaseName[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export const parseNamespaceToken = (token: NamespaceToken): [string, string] => {
  const separator = token.indexOf(':');
  if (separator < 0) {
    return ['', token];
  }
  return [token.slice(0, separator), token.slice(separator + 1)];
};

export const joinNamespaceToken = (scope: string, value: string): NamespaceToken => `${scope}:${value}`;

export const phaseRoute = (tenant: string, phase: PhaseName): RouteKey => `route:${tenant}.${phase}`;

export const makeOrchestratorId = (value: string): OrchestratorId => withBrand(`orch-${value}`, 'OrchestratorId');
export const makeWorkspaceId = (tenant: string, name: string): WorkspaceId =>
  withBrand(`${tenant}/ws/${name}`, 'WorkspaceId');
export const makeWorkloadId = (workspace: WorkspaceId, segment: string): WorkloadId =>
  withBrand(`${workspace}::${segment}`, 'WorkloadId');
export const makePlanId = (workspace: WorkspaceId, name: string): PlanId =>
  withBrand(`${workspace}::plan:${name}`, 'PlanId');
export const makePluginId = (domain: string, name: string): PluginId =>
  withBrand(`${domain}@${name}`, 'PluginId');
export const makeRunId = (workspace: WorkspaceId, tag: string): RunId =>
  withBrand(`${workspace}::run:${tag}`, 'RunId');
export const makeStreamToken = (prefix: string, nonce: string): StreamToken =>
  withBrand(`${prefix}.${nonce}`, 'StreamToken');
export const makeEventId = (runId: RunId, key: string): EventId =>
  withBrand(`${runId}#${key}`, 'EventId');

export const toTimelineStamp = ({
  orchestratorId,
  workspaceId,
  tenant,
  phase,
  token,
}: {
  orchestratorId: OrchestratorId;
  workspaceId: WorkspaceId;
  tenant: string;
  phase: PhaseName;
  token: string;
}): TimelineStamp => ({
  orchestratorId,
  workspaceId,
  tenant,
  phase,
  token: withBrand(token, 'StreamToken'),
});

export const buildWindow = (from: number, to: number): TemporalWindow => ({
  from: Number.isFinite(from) ? Math.max(0, Math.floor(from)) : 0,
  to: Number.isFinite(to) ? Math.max(0, Math.floor(to)) : from + 1,
});

export const isHealthyState = (state: HealthState): boolean => state === 'healthy';

export const severityRank = (severity: Severity): number =>
  ({
    notice: 0,
    warning: 1,
    critical: 2,
    blocked: 3,
  })[severity];

export const bySeverity = (left: Severity, right: Severity): number => severityRank(left) - severityRank(right);
