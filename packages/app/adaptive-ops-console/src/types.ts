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
