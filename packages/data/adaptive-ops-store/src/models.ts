import { AdaptiveRun, AdaptivePolicy, AdaptiveDecision } from '@domain/adaptive-ops';
import { Brand } from '@shared/core';

export type AdaptiveRunId = Brand<string, 'AdaptiveRunId'>;

export interface RunDecisionRecord {
  runId: AdaptiveRunId;
  policy: AdaptivePolicy;
  decision: AdaptiveDecision;
  createdAt: string;
}

export interface RunRow {
  id: AdaptiveRunId;
  tenantId: Brand<string, 'TenantId'>;
  run: AdaptiveRun;
  decisions: readonly RunDecisionRecord[];
}

export type RunQuery = {
  tenantId?: Brand<string, 'TenantId'>;
  status?: AdaptiveRun['status'];
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

export interface RunPage {
  rows: readonly RunRow[];
  nextCursor?: string;
}
