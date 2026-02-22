export type ReadinessSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RunState = 'draft' | 'approved' | 'active' | 'suppressed' | 'complete' | 'failed';
export type RiskBand = 'green' | 'amber' | 'red';

export type Brand<T, B extends string> = T & { readonly __brand: B };
export type ReadinessRunId = Brand<string, 'ReadinessRunId'>;
export type RecoveryTargetId = Brand<string, 'RecoveryTargetId'>;
export type DirectiveId = Brand<string, 'ReadinessDirectiveId'>;

export type ReadonlyDictionary<TValue, TKey extends string = string> = Readonly<Record<TKey, TValue>>;
export type NonEmpty<T extends unknown[]> = T extends [infer _, ...infer Tail] ? T & { readonly length: Tail['length'] & number } : never;
export type AtLeastOne<T> = Partial<T> & {
  [K in keyof T]-?: NonNullable<T[K]> extends never ? never : Pick<T, K>;
}[keyof T];
export type BrandedWindow<T extends string> = Brand<string, T>;

export interface TimePoint {
  ts: string;
  value: number;
}

export interface ReadinessDirectiveTemplate {
  directiveId: DirectiveId;
  name: string;
  description: string;
  timeoutMinutes: number;
  enabled: boolean;
  retries: number;
  weight?: number;
}

export interface ReadinessTarget {
  id: RecoveryTargetId;
  name: string;
  ownerTeam: string;
  region: string;
  criticality: ReadinessSeverity;
  owners: string[];
}

export interface ReadinessWindow {
  windowId: Brand<string, 'ReadinessWindowId'>;
  label: string;
  fromUtc: string;
  toUtc: string;
  timezone: string;
}

export interface ReadinessSignal {
  signalId: Brand<string, 'ReadinessSignalId'>;
  runId: ReadinessRunId;
  targetId: RecoveryTargetId;
  source: 'telemetry' | 'synthetic' | 'manual-check';
  name: string;
  severity: ReadinessSeverity;
  capturedAt: string;
  details: Readonly<Record<string, unknown>>;
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
    tenant?: string;
  };
}

export interface ReadinessDirective {
  directiveId: DirectiveId;
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
  directiveIds: DirectiveId[];
}

export interface ReadinessConstraintWindow {
  start: string;
  end: string;
  maxConcurrentDirectives: number;
}

export interface ReadinessConstraintSet {
  policyId: string;
  maxSignalsPerMinute?: number;
  minimumActiveTargets: number;
  maxDirectiveRetries: number;
  blackoutWindows: readonly ReadinessConstraintWindow[];
}

export interface ReadinessReadModelEnvelope<TPayload = Record<string, unknown>> {
  runId: ReadinessRunId;
  payload: TPayload;
  createdAt: string;
  revision: number;
  tags: readonly string[];
}

export interface ReadinessForecast {
  runId: ReadinessRunId;
  horizonMinutes: number;
  projectedSignals: TimePoint[];
  confidence: number;
}

export interface ReadinessRunbook<TState = Record<string, unknown>> {
  runbookId: Brand<string, 'ReadinessRunbookId'>;
  name: string;
  strategy: string;
  state: TState;
}

export type ReadinessSignalEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  signal: ReadinessSignal;
  envelope: TPayload;
  weight: number;
};

export type ResultBy<T, K extends keyof T> = {
  [P in K]: T[P];
};

export type ReadinessPolicyMode = 'advisory' | 'enforced' | 'emergency';

export interface ReadinessSloTarget {
  key: string;
  warningAt: number;
  criticalAt: number;
  unit: string;
}

export interface ReadinessSloProfile {
  profileId: Brand<string, 'ReadinessSloProfileId'>;
  name: string;
  targets: ReadonlyArray<ReadinessSloTarget>;
  windowMinutes: number;
}

export interface ReadinessRunbookExecution {
  executionId: Brand<string, 'ReadinessExecutionId'>;
  runbookId: ReadinessRunbook['runbookId'];
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  startedAt: string;
  completedAt?: string;
  operator: string;
  notes: readonly string[];
}

export interface ReadinessPolicyViolation {
  reason: string;
  location: string;
  severity: ReadinessSeverity;
  observedAt: string;
}

export interface ReadinessPolicyEnvelope {
  policyId: string;
  policyName: string;
  mode: ReadinessPolicyMode;
  constraints: ReadinessConstraintSet;
  allowedRegions: readonly string[];
  blockedSignalSources: readonly ReadinessSignal['source'][];
  violations?: readonly ReadinessPolicyViolation[];
}

export type ReadinessDirectiveChain<T> = {
  nodes: ReadonlyArray<T>;
  adjacency: ReadonlyDictionary<ReadonlyArray<DirectiveId>>;
};
