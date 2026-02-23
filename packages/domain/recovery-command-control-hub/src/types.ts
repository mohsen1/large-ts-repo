import { Brand, withBrand } from '@shared/core';

export type HubTenantId = Brand<string, 'HubTenantId'>;
export type HubRunId = Brand<string, 'HubRunId'>;
export type HubNodeId = Brand<string, 'HubNodeId'>;
export type HubEdgeId = Brand<string, 'HubEdgeId'>;

export type ImpactBand = 'critical' | 'high' | 'medium' | 'low';
export type CommandState = 'queued' | 'scheduled' | 'executing' | 'success' | 'failed' | 'skipped';
export type WindowState = 'open' | 'sealed' | 'closed';
export type RiskPosture = 'stable' | 'elevated' | 'degraded';

export interface HubConstraint {
  readonly type: 'precedence' | 'regional' | 'resource' | 'exclusive';
  readonly reason: string;
  readonly owner: string;
}

export interface HubNode {
  readonly id: HubNodeId;
  readonly tenantId: HubTenantId;
  readonly commandName: string;
  readonly component: string;
  readonly ownerTeam: string;
  readonly impactBand: ImpactBand;
  readonly estimatedDurationMs: number;
  readonly requiredContacts: readonly string[];
  readonly constraints: readonly HubConstraint[];
  readonly state: CommandState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface HubEdge {
  readonly id: HubEdgeId;
  readonly from: HubNodeId;
  readonly to: HubNodeId;
  readonly latencyMs: number;
  readonly constraint: HubConstraint;
}

export interface HubTopology {
  readonly nodes: readonly HubNode[];
  readonly edges: readonly HubEdge[];
  readonly nodeIds: readonly HubNodeId[];
  readonly topologyVersion: number;
}

export interface HubRun {
  readonly runId: HubRunId;
  readonly tenantId: HubTenantId;
  readonly topology: HubTopology;
  readonly state: CommandState;
  readonly riskScore: number;
  readonly posture: RiskPosture;
  readonly createdAt: string;
  readonly completedAt?: string;
}

export interface HubCheckpoint {
  readonly key: string;
  readonly nodeId: HubNodeId;
  readonly state: CommandState;
  readonly at: string;
  readonly detail: string;
}

export interface HubExecution {
  readonly run: HubRun;
  readonly checkpoints: readonly HubCheckpoint[];
  readonly blocked: readonly HubNodeId[];
  readonly operatorNotes: readonly string[];
  readonly controlWindow: HubControlWindow;
}

export interface HubDraft {
  readonly tenantId: HubTenantId;
  readonly nodes: readonly HubNode[];
  readonly topology: HubTopology;
  readonly summary: HubSummary;
}

export interface HubSummary {
  readonly runCount: number;
  readonly totalNodes: number;
  readonly byState: Record<CommandState, number>;
  readonly byBand: Record<ImpactBand, number>;
  readonly totalDurationMs: number;
  readonly blockedNodeCount: number;
}

export interface HubControlWindow {
  readonly id: string;
  readonly runId: HubRunId;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly state: WindowState;
}

export interface HubDraftInput {
  readonly tenantId: string;
  readonly commandName: string;
  readonly component: string;
  readonly ownerTeam: string;
  readonly impactBand: ImpactBand;
  readonly estimatedDurationMs: number;
  readonly constraints?: readonly HubConstraint[];
}

export const brandTenantId = (value: string): HubTenantId => withBrand(value, 'HubTenantId');
export const brandRunId = (value: string): HubRunId => withBrand(value, 'HubRunId');
export const brandNodeId = (value: string): HubNodeId => withBrand(value, 'HubNodeId');
export const brandEdgeId = (value: string): HubEdgeId => withBrand(value, 'HubEdgeId');

export const emptySummary = (): HubSummary => ({
  runCount: 0,
  totalNodes: 0,
  byState: {
    queued: 0,
    scheduled: 0,
    executing: 0,
    success: 0,
    failed: 0,
    skipped: 0,
  },
  byBand: {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  },
  totalDurationMs: 0,
  blockedNodeCount: 0,
});

export const makeNode = (input: HubDraftInput): HubNode => {
  const tenantId = brandTenantId(input.tenantId.trim().toLowerCase());
  const id = brandNodeId(`${tenantId}:${input.commandName}:${Date.now()}`);
  const createdAt = new Date().toISOString();
  return {
    id,
    tenantId,
    commandName: input.commandName,
    component: input.component,
    ownerTeam: input.ownerTeam,
    impactBand: input.impactBand,
    estimatedDurationMs: Math.max(1, input.estimatedDurationMs),
    requiredContacts: [],
    constraints: [...(input.constraints ?? [])],
    state: 'queued',
    createdAt,
    updatedAt: createdAt,
  };
};
