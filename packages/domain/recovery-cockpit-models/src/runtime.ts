import { AuditContext, EntityRef, PlanId, PlanLabel, UtcIsoTimestamp, Region, ServiceCode, Versioned, EntityId, RunId } from './identifiers';

export type StepState = 'idle' | 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';
export type OrchestrationMode = 'automated' | 'manual' | 'semi';

export type ActionAttempt = {
  index: number;
  startedAt: UtcIsoTimestamp;
  completedAt?: UtcIsoTimestamp;
  message?: string;
};

export type RecoveryAction = {
  id: EntityId;
  serviceCode: ServiceCode;
  region: Region;
  command: string;
  desiredState: 'up' | 'drained' | 'degraded';
  dependencies: readonly EntityId[];
  expectedDurationMinutes: number;
  retriesAllowed: number;
  tags: ReadonlyArray<string>;
};

export type RecoveryPlan = Versioned & {
  readonly planId: PlanId;
  readonly labels: PlanLabel;
  readonly mode: OrchestrationMode;
  readonly title: string;
  readonly description: string;
  readonly actions: readonly RecoveryAction[];
  readonly audit: ReadonlyArray<AuditContext>;
  readonly slaMinutes: number;
  readonly isSafe: boolean;
};

export type RuntimeRun = {
  runId: RunId;
  planId: PlanId;
  startedAt: UtcIsoTimestamp;
  state: StepState;
  activeActionIds: EntityId[];
  completedActions: RecoveryAction[];
  failedActions: RecoveryAction[];
  context: AuditContext;
  nextRetryAt?: UtcIsoTimestamp;
};

export interface PlanRuntime {
  getPlan(planId: PlanId): Promise<RecoveryPlan | undefined>;
  getLatestRun(planId: PlanId): Promise<RuntimeRun | undefined>;
  startRun(planId: PlanId, actor: EntityRef<'operator'>): Promise<RuntimeRun>;
  abortRun(runId: string): Promise<boolean>;
}

export type ReadinessWindow = {
  at: UtcIsoTimestamp;
  score: number;
  services: ReadonlyArray<ServiceCode>;
  expectedRecoveryMinutes: number;
};

export type ReadinessEnvelope = {
  planId: PlanId;
  namespace: string;
  baselineScore: number;
  windows: readonly ReadinessWindow[];
};

export type CommandEvent = {
  eventId: EntityId;
  planId: PlanId;
  runId?: string;
  actionId: EntityId;
  at: UtcIsoTimestamp;
  status: StepState;
  reason?: string;
};

export const isTerminal = (state: StepState): boolean =>
  state === 'completed' || state === 'failed' || state === 'cancelled';

export const asActionAttempt = (index: number, startedAt: Date, message?: string): ActionAttempt => ({
  index,
  startedAt: startedAt.toISOString() as UtcIsoTimestamp,
  message,
});

export const computeReadiness = (readiness: number, failures: number): number => {
  const normalized = Math.max(0, Math.min(100, readiness - failures * 4));
  return Number(normalized.toFixed(2));
};

export const sortActionsByDependencyDepth = (actions: readonly RecoveryAction[]): RecoveryAction[] => {
  const byId = new Map<string, { node: RecoveryAction; incoming: number; outgoing: Set<string> }>();
  for (const action of actions) {
    byId.set(action.id, { node: action, incoming: action.dependencies.length, outgoing: new Set<string>() });
  }

  for (const action of actions) {
    for (const dependency of action.dependencies) {
      byId.get(dependency)?.outgoing.add(action.id);
    }
  }

  const queue = [...actions.filter((action) => (byId.get(action.id)?.incoming ?? 0) === 0)];
  const resolved: RecoveryAction[] = [];

  while (queue.length > 0) {
    const action = queue.shift();
    if (!action) continue;
    resolved.push(action);

    for (const next of byId.get(action.id)?.outgoing ?? []) {
      const nextIncoming = (byId.get(next)?.incoming ?? 0) - 1;
      const entry = byId.get(next);
      if (!entry) continue;
      entry.incoming = nextIncoming;
      if (entry.incoming <= 0) {
        queue.push(entry.node);
      }
    }
  }

  return resolved.length === actions.length ? resolved : [...actions];
};
