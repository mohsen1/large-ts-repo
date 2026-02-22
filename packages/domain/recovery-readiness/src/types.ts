export type ReadinessSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RunState = 'draft' | 'approved' | 'active' | 'suppressed' | 'complete' | 'failed';
export type RiskBand = 'green' | 'amber' | 'red';

export type Brand<T, B extends string> = T & { readonly __brand: B };
export type ReadinessRunId = Brand<string, 'ReadinessRunId'>;
export type RecoveryTargetId = Brand<string, 'RecoveryTargetId'>;

export interface ReadinessTarget {
  id: RecoveryTargetId;
  name: string;
  ownerTeam: string;
  region: string;
  criticality: ReadinessSeverity;
  owners: string[];
}

export interface ReadinessSignal {
  signalId: Brand<string, 'ReadinessSignalId'>;
  runId: ReadinessRunId;
  targetId: RecoveryTargetId;
  source: 'telemetry' | 'synthetic' | 'manual-check';
  name: string;
  severity: ReadinessSeverity;
  capturedAt: string;
  details: Record<string, unknown>;
}

export interface ReadinessWindow {
  windowId: Brand<string, 'ReadinessWindowId'>;
  label: string;
  fromUtc: string;
  toUtc: string;
  timezone: string;
}

export interface RecoveryReadinessPlan {
  planId: Brand<string, 'RecoveryReadinessPlanId'>;
  runId: ReadinessRunId;
  title: string;
  objective: string;
  state: RunState;
  createdAt: string;
  targets: ReadinessTarget[];
  windows: ReadinessWindow[];
  signals: ReadinessSignal[];
  riskBand: RiskBand;
  metadata: {
    owner: string;
    tags: readonly string[];
  };
}

export interface ReadinessDirective {
  directiveId: Brand<string, 'ReadinessDirectiveId'>;
  name: string;
  description: string;
  timeoutMinutes: number;
  enabled: boolean;
  retries: number;
  dependsOn: ReadinessDirective[];
}

export interface RecoveryReadinessPlanDraft {
  runId: ReadinessRunId;
  title: string;
  objective: string;
  owner: string;
  targetIds: RecoveryTargetId[];
  directiveIds: ReadinessDirective['directiveId'][];
}
