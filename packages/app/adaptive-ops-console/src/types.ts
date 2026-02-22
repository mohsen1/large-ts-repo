export interface UiPolicyRecord {
  policyId: string;
  tenantId: string;
  confidence: number;
}

export interface UiActionRecord {
  type: string;
  intensity: number;
  target: string;
  justification: string;
}

export interface UiRunSummary {
  tenantId: string;
  ok: boolean;
  runId?: string;
  status: string;
  decisionCount: number;
  topActionType: string | null;
  conflictCount: number;
  policyNames: readonly string[];
}

export interface CommandCenterPolicyRow {
  policyId: string;
  tenantId: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  conflictCount: number;
  status: 'active' | 'blocked' | 'queued';
}

export interface CommandCenterLog {
  at: string;
  title: string;
  payload: string;
}

export interface CommandCenterSummary {
  totalCoverage: number;
  totalRisk: number;
  planWindowMinutes: number;
  tenantId: string;
}

export type CommandCenterMode = 'overview' | 'timeline' | 'dependencies' | 'simulate';
