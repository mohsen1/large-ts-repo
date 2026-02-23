import { Brand } from '@shared/type-level';

export type CadenceId = Brand<string, 'CadenceId'>;
export type CadencePlanId = Brand<string, 'CadencePlanId'>;
export type CadenceWindowId = Brand<string, 'CadenceWindowId'>;
export type CadenceIntentId = Brand<string, 'CadenceIntentId'>;

export type CadenceIntensity = 'low' | 'medium' | 'high' | 'critical';
export type CadenceWindowState = 'planned' | 'queued' | 'active' | 'degraded' | 'completed' | 'terminated';
export type CadenceRisk = 'minimal' | 'elevated' | 'significant' | 'critical';
export type CadenceChannel = 'compute' | 'network' | 'storage' | 'fabric' | 'control';

export interface CadenceWindowTag {
  key: string;
  value: string;
  namespace: 'service' | 'owner' | 'environment' | 'team';
}

export interface CadenceWindow {
  readonly id: CadenceWindowId;
  readonly planId: CadencePlanId;
  readonly channel: CadenceChannel;
  readonly name: string;
  readonly owner: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly leadMinutes: number;
  readonly lagMinutes: number;
  readonly intensity: CadenceIntensity;
  readonly state: CadenceWindowState;
  readonly risk: CadenceRisk;
  readonly tags: readonly CadenceWindowTag[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CadenceTemplate {
  readonly id: Brand<string, 'CadenceTemplateId'>;
  readonly title: string;
  readonly description: string;
  readonly channel: CadenceChannel;
  readonly windows: readonly Omit<CadenceWindow, 'id' | 'planId' | 'createdAt' | 'updatedAt'>[];
  readonly defaultIntensity: CadenceIntensity;
  readonly createdBy: string;
  readonly checksum: Brand<string, 'TemplateChecksum'>;
}

export interface CadencePlan {
  readonly id: CadencePlanId;
  readonly organizationId: string;
  readonly displayName: string;
  readonly templateId: CadenceTemplate['id'];
  readonly status: 'draft' | 'active' | 'paused' | 'archived';
  readonly owner: string;
  readonly objective: {
    target: string;
    constraints: readonly string[];
  };
  readonly windows: readonly CadenceWindow[];
  readonly intentIds: readonly CadenceIntentId[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CadenceIntent {
  readonly id: CadenceIntentId;
  readonly planId: CadencePlanId;
  readonly requestedAt: string;
  readonly requestedBy: string;
  readonly requestedWindowId: CadenceWindowId;
  readonly rationale: string;
  readonly expectedOutcome: string;
  readonly urgency: CadenceIntensity;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface CadenceWindowForecast {
  readonly windowId: CadenceWindowId;
  readonly riskScore: number;
  readonly confidence: number;
  readonly projectedStartAt: string;
  readonly projectedEndAt: string;
  readonly expectedCollisions: readonly CadenceWindowId[];
  readonly remediationHints: readonly string[];
}

export interface CadencePlanSnapshot {
  readonly planId: CadencePlanId;
  readonly snapshotAt: string;
  readonly totalLeadMinutes: number;
  readonly totalLagMinutes: number;
  readonly aggregateRisk: CadenceRisk;
  readonly activeWindowCount: number;
  readonly forecast: readonly CadenceWindowForecast[];
}

export interface CadenceExecutionEvent {
  readonly id: Brand<string, 'CadenceExecutionEventId'>;
  readonly planId: CadencePlanId;
  readonly windowId: CadenceWindowId;
  readonly kind: 'created' | 'activated' | 'degraded' | 'restored' | 'completed' | 'superseded';
  readonly timestamp: string;
  readonly detail: string;
}

export interface CadenceConstraint {
  readonly id: Brand<string, 'CadenceConstraintId'>;
  readonly planId: CadencePlanId;
  readonly windowId: CadenceWindowId;
  readonly maxLagMinutes: number;
  readonly maxLeadMinutes: number;
  readonly maxConcurrentWindows: number;
  readonly allowedChannels: readonly CadenceChannel[];
  readonly forbidOverlapWithIntents: readonly CadenceIntentId[];
}

export type CadenceWindowMap = Readonly<Record<CadenceWindowId, CadenceWindow>>;

export interface CadencePlanEnvelope<TStatus extends string = CadenceWindowState> {
  readonly id: CadencePlanId;
  readonly status: TStatus;
  readonly windowStates: Readonly<Record<CadenceWindowId, { state: CadenceWindowState; status: TStatus }>>;
}

export interface CadencePlanDiff {
  readonly planId: CadencePlanId;
  readonly before: CadencePlan;
  readonly after: CadencePlan;
  readonly changedWindowIds: readonly CadenceWindowId[];
  readonly changedAt: string;
}

export interface CadenceTimelinePoint {
  readonly windowId: CadenceWindowId;
  readonly sequence: number;
  readonly startAt: string;
  readonly endAt: string;
  readonly risk: CadenceRisk;
  readonly label: string;
}

export function isCriticalRisk(risk: CadenceRisk): boolean {
  return risk === 'critical';
}

export function isActiveState(state: CadenceWindowState): boolean {
  return state === 'active' || state === 'queued';
}
