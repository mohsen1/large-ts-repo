export type BranchMode = 'strict' | 'lax' | 'diagnostic' | 'sim';

export type BranchState = 'start' | 'active' | 'guarded' | 'quarantined' | 'resolved' | 'failed' | 'escalated' | 'drained';

interface BaseEvent {
  readonly source: string;
  readonly tenant: string;
  readonly index: number;
  readonly mode: BranchMode;
}

interface BranchBoot extends BaseEvent {
  readonly kind: 'boot';
  readonly canary: boolean;
}

interface BranchScan extends BaseEvent {
  readonly kind: 'scan';
  readonly items: readonly string[];
}

interface BranchClassify extends BaseEvent {
  readonly kind: 'classify';
  readonly confidence: number;
}

interface BranchAssess extends BaseEvent {
  readonly kind: 'assess';
  readonly score: number;
}

interface BranchContain extends BaseEvent {
  readonly kind: 'contain';
  readonly budgetMs: number;
}

interface BranchNotify extends BaseEvent {
  readonly kind: 'notify';
  readonly channels: readonly ('email' | 'pager' | 'webhook')[];
}

interface BranchThrottle extends BaseEvent {
  readonly kind: 'throttle';
  readonly limit: number;
}

interface BranchRollback extends BaseEvent {
  readonly kind: 'rollback';
  readonly checkpoint: string;
}

interface BranchReconcile extends BaseEvent {
  readonly kind: 'reconcile';
  readonly attempts: number;
}

interface BranchObserve extends BaseEvent {
  readonly kind: 'observe';
  readonly samples: readonly number[];
}

interface BranchFinalize extends BaseEvent {
  readonly kind: 'finalize';
  readonly success: boolean;
}

interface BranchFallback extends BaseEvent {
  readonly kind: 'fallback';
  readonly reason: string;
}

interface BranchAudit extends BaseEvent {
  readonly kind: 'audit';
  readonly trail: readonly string[];
}

interface BranchReplay extends BaseEvent {
  readonly kind: 'replay';
  readonly seed: number;
}

interface BranchEvacuate extends BaseEvent {
  readonly kind: 'evacuate';
  readonly destinations: readonly string[];
}

interface BranchSnapshot extends BaseEvent {
  readonly kind: 'snapshot';
  readonly path: string;
}

interface BranchResume extends BaseEvent {
  readonly kind: 'resume';
  readonly reason: 'manual' | 'auto';
}

interface BranchDrain extends BaseEvent {
  readonly kind: 'drain';
  readonly queueDepth: number;
}

interface BranchSuppress extends BaseEvent {
  readonly kind: 'suppress';
  readonly windowMs: number;
}

interface BranchRoute extends BaseEvent {
  readonly kind: 'route';
  readonly target: string;
}

interface BranchReboot extends BaseEvent {
  readonly kind: 'reboot';
  readonly expected: boolean;
}

interface BranchTriage extends BaseEvent {
  readonly kind: 'triage';
  readonly queue: number;
}

interface BranchRelease extends BaseEvent {
  readonly kind: 'release';
  readonly artifact: string;
}

interface BranchDegrade extends BaseEvent {
  readonly kind: 'degrade';
  readonly degradeLevel: number;
}

interface BranchAbort extends BaseEvent {
  readonly kind: 'abort';
  readonly abortCode: string;
}

interface BranchComplete extends BaseEvent {
  readonly kind: 'complete';
  readonly exitCode: number;
}

interface BranchRetry extends BaseEvent {
  readonly kind: 'retry';
  readonly next: number;
}

interface BranchHandoff extends BaseEvent {
  readonly kind: 'handoff';
  readonly team: string;
}

interface BranchPlan extends BaseEvent {
  readonly kind: 'plan';
  readonly steps: readonly string[];
}

interface BranchPause extends BaseEvent {
  readonly kind: 'pause';
  readonly duration: number;
}

interface BranchCancel extends BaseEvent {
  readonly kind: 'cancel';
  readonly cause: string;
}

interface BranchHold extends BaseEvent {
  readonly kind: 'hold';
  readonly holdBy: string;
}

interface BranchDrainStrategy extends BaseEvent {
  readonly kind: 'drain_strategy';
  readonly strategy: string;
}

interface BranchRoutePlan extends BaseEvent {
  readonly kind: 'route_plan';
  readonly windows: readonly number[];
}

interface BranchEscalate extends BaseEvent {
  readonly kind: 'escalate';
  readonly urgency: number;
}

interface BranchStabilize extends BaseEvent {
  readonly kind: 'stabilize';
  readonly targetMs: number;
}

interface BranchThrottleWindow extends BaseEvent {
  readonly kind: 'throttle_window';
  readonly hitRate: number;
}

export type BranchEvent =
  | BranchBoot
  | BranchScan
  | BranchClassify
  | BranchAssess
  | BranchContain
  | BranchNotify
  | BranchThrottle
  | BranchRollback
  | BranchReconcile
  | BranchObserve
  | BranchFinalize
  | BranchFallback
  | BranchAudit
  | BranchReplay
  | BranchEvacuate
  | BranchSnapshot
  | BranchResume
  | BranchDrain
  | BranchSuppress
  | BranchRoute
  | BranchReboot
  | BranchTriage
  | BranchRelease
  | BranchDegrade
  | BranchAbort
  | BranchComplete
  | BranchRetry
  | BranchHandoff
  | BranchPlan
  | BranchPause
  | BranchCancel
  | BranchHold
  | BranchDrainStrategy
  | BranchRoutePlan
  | BranchEscalate
  | BranchStabilize
  | BranchThrottleWindow;

export type BranchResult<T extends BranchEvent> = T['kind'] extends 'boot'
  ? { state: 'active'; score: 1 }
  : T['kind'] extends 'scan'
    ? { state: 'start'; scanned: true }
    : T['kind'] extends 'classify'
      ? { state: 'guarded'; confidence: number }
      : T['kind'] extends 'assess'
        ? { state: 'active'; score: number }
        : T['kind'] extends 'contain'
          ? { state: 'active'; budgetMs: number }
          : T['kind'] extends 'notify'
            ? { state: 'resolved'; channels: number }
            : T['kind'] extends 'throttle'
              ? { state: 'guarded'; limit: number }
              : T['kind'] extends 'rollback'
                ? { state: 'escalated'; checkpoint: string }
                : T['kind'] extends 'reconcile'
                  ? { state: 'active'; attempts: number }
                  : T['kind'] extends 'observe'
                    ? { state: 'active'; samples: number }
                    : T['kind'] extends 'finalize'
                      ? { state: 'resolved'; success: boolean }
                      : T['kind'] extends 'fallback'
                        ? { state: 'drained'; notes: readonly string[] }
                        : T['kind'] extends 'audit'
                          ? { state: 'resolved'; trail: number }
                          : T['kind'] extends 'replay'
                            ? { state: 'resolved' | 'active'; seed: number }
                            : T['kind'] extends 'evacuate'
                              ? { state: 'active' | 'escalated'; notes: readonly string[] }
                              : T['kind'] extends 'snapshot'
                                ? { state: 'resolved'; notes: readonly string[] }
                                : T['kind'] extends 'resume'
                                  ? { state: 'active' | 'start'; notes: readonly string[] }
                                  : T['kind'] extends 'drain'
                                    ? { state: 'drained'; notes: readonly string[] }
                                    : T['kind'] extends 'suppress'
                                      ? { state: 'guarded'; notes: readonly string[] }
                                      : T['kind'] extends 'route'
                                        ? { state: 'active'; notes: readonly string[] }
                                        : T['kind'] extends 'reboot'
                                          ? { state: 'active' | 'failed'; notes: readonly string[] }
                                          : T['kind'] extends 'triage'
                                            ? { state: 'active'; queue: number }
                                            : T['kind'] extends 'release'
                                              ? { state: 'resolved' | 'failed'; notes: readonly string[] }
                                              : T['kind'] extends 'degrade'
                                                ? { state: 'escalated' | 'active'; notes: readonly string[] }
                                                : T['kind'] extends 'abort'
                                                  ? { state: 'failed'; notes: readonly string[] }
                                                  : T['kind'] extends 'complete'
                                                    ? { state: 'resolved' | 'failed'; notes: readonly string[] }
                                                    : T['kind'] extends 'retry'
                                                      ? { state: 'start' | 'active'; notes: readonly string[] }
                                                      : T['kind'] extends 'handoff'
                                                        ? { state: 'guarded' | 'active'; notes: readonly string[] }
                                                        : T['kind'] extends 'plan'
                                                          ? { state: 'start' | 'active'; notes: readonly string[] }
                                                          : T['kind'] extends 'pause'
                                                            ? { state: 'drained' | 'active'; notes: readonly string[] }
                                                            : T['kind'] extends 'cancel'
                                                              ? { state: 'failed'; notes: readonly string[] }
                                                              : T['kind'] extends 'hold'
                                                                ? { state: 'guarded' | 'failed'; notes: readonly string[] }
                                                                : T['kind'] extends 'drain_strategy'
                                                                  ? { state: 'drained' | 'active'; notes: readonly string[] }
                                                                  : T['kind'] extends 'route_plan'
                                                                    ? { state: 'active' | 'start'; windows: readonly number[] }
                                                                    : T['kind'] extends 'escalate'
                                                                      ? { state: 'escalated'; urgency: number }
                                                                      : T['kind'] extends 'stabilize'
                                                                        ? { state: 'resolved' | 'active'; targetMs: number }
                                                                        : T['kind'] extends 'throttle_window'
                                                                          ? { state: 'guarded' | 'active'; hitRate: number }
                                                                          : { state: 'start'; notes: readonly string[] };

const isSeverityHigh = (event: BranchEvent): boolean => {
  if (event.kind === 'classify') {
    return event.confidence > 0.82;
  }
  if (event.kind === 'escalate') {
    return event.urgency > 7;
  }
  if (event.kind === 'degrade') {
    return event.degradeLevel > 6;
  }
  return event.mode === 'strict' || event.kind === 'boot';
};

const shouldEscalate = (state: BranchState, event: BranchEvent): boolean =>
  (state === 'active' || state === 'guarded') &&
  (event.kind === 'notify' || event.kind === 'rollback' || event.kind === 'escalate' || event.kind === 'release');

export const evaluateBranchFlow = <T extends BranchEvent>(event: T): BranchResult<T> => {
  let state: BranchState = 'start';
  const asResult = <U extends BranchEvent>(value: unknown): BranchResult<U> => value as unknown as BranchResult<U>;

  if (isSeverityHigh(event)) {
    state = 'guarded';
  }

  switch (event.kind) {
    case 'boot': {
      state = event.canary && event.mode === 'strict' ? 'active' : 'start';
      return asResult({ state, score: 1 });
    }
    case 'scan': {
      state = event.items.length > 0 ? 'active' : 'failed';
      return asResult({ state, scanned: true });
    }
    case 'classify': {
      state = event.confidence > 0.85 ? 'guarded' : 'active';
      return asResult({ state, confidence: event.confidence });
    }
    case 'assess': {
      state = event.score > 0.75 ? 'active' : 'escalated';
      return asResult({ state, score: event.score });
    }
    case 'contain': {
      state = event.budgetMs > 10 ? 'active' : 'failed';
      return asResult({ state, budgetMs: event.budgetMs });
    }
    case 'notify': {
      state = event.channels.length > 1 ? 'resolved' : 'active';
      return asResult({ state, channels: event.channels.length });
    }
    case 'throttle':
      state = shouldEscalate(state, event) ? 'escalated' : event.limit < 10 ? 'guarded' : 'active';
      return asResult({ state, limit: event.limit });
    case 'throttle_window':
      state = event.hitRate < 0.2 ? 'escalated' : 'guarded';
      return asResult({ state, hitRate: event.hitRate });
    case 'rollback':
      state = 'escalated';
      return asResult({ state, checkpoint: event.checkpoint });
    case 'reconcile':
      state = event.attempts > 3 ? 'failed' : 'active';
      return asResult({ state, attempts: event.attempts });
    case 'observe':
      state = event.samples.length > 6 ? 'active' : 'guarded';
      return asResult({ state, samples: event.samples.length });
    case 'finalize':
      state = event.success ? 'resolved' : 'failed';
      return asResult({ state, success: event.success });
    case 'fallback':
      state = event.reason.length > 0 ? 'drained' : 'failed';
      return asResult({ state, notes: ['fallback', event.reason] });
    case 'audit':
      state = event.trail.length > 0 ? 'resolved' : 'active';
      return asResult({ state, trail: event.trail.length });
    case 'replay':
      state = event.seed % 2 === 0 ? 'resolved' : 'active';
      return asResult({ state, seed: event.seed });
    case 'evacuate':
      state = event.destinations.length > 0 ? 'escalated' : 'failed';
      return asResult({ state, notes: ['evacuate', ...event.destinations] });
    case 'snapshot':
      state = event.path.length > 0 ? 'resolved' : 'active';
      return asResult({ state, notes: ['snapshot', event.path] });
    case 'resume':
      state = event.reason === 'manual' ? 'active' : 'start';
      return asResult({ state, notes: ['resume', event.reason] });
    case 'drain':
      state = event.queueDepth > 100 ? 'drained' : 'active';
      return asResult({ state, notes: ['drain', `${event.queueDepth}`] });
    case 'suppress':
      state = event.windowMs > 300 ? 'guarded' : 'active';
      return asResult({ state, notes: ['suppress', `${event.windowMs}`] });
    case 'route':
      state = event.target.length > 0 ? 'active' : 'failed';
      return asResult({ state, notes: ['route', event.target] });
    case 'reboot':
      state = event.expected ? 'active' : 'failed';
      return asResult({ state, notes: ['reboot', `${event.expected}`] });
    case 'triage':
      state = event.queue > 10 ? 'guarded' : 'active';
      return asResult({ state, queue: event.queue });
    case 'release':
      state = event.artifact.length > 0 ? 'resolved' : 'failed';
      return asResult({ state, notes: ['release', event.artifact] });
    case 'degrade':
      state = event.degradeLevel > 5 ? 'escalated' : 'active';
      return asResult({ state, notes: ['degrade', `${event.degradeLevel}`] });
    case 'abort':
      state = 'failed';
      return asResult({ state, notes: ['abort', event.abortCode] });
    case 'complete':
      state = event.exitCode === 0 ? 'resolved' : 'failed';
      return asResult({ state, notes: ['complete', `${event.exitCode}`] });
    case 'retry':
      state = event.next > 2 ? 'start' : 'active';
      return asResult({ state, notes: ['retry', `${event.next}`] });
    case 'handoff':
      state = event.team.length > 0 ? 'guarded' : 'active';
      return asResult({ state, notes: ['handoff', event.team] });
    case 'plan':
      state = event.steps.length > 1 ? 'start' : 'active';
      return asResult({ state, notes: ['plan', ...event.steps] });
    case 'pause':
      state = event.duration > 100 ? 'drained' : 'active';
      return asResult({ state, notes: ['pause', `${event.duration}`] });
    case 'cancel':
      state = 'failed';
      return asResult({ state, notes: ['cancel', event.cause] });
    case 'hold':
      state = event.holdBy.length > 0 ? 'guarded' : 'failed';
      return asResult({ state, notes: ['hold', event.holdBy] });
    case 'drain_strategy':
      state = event.strategy.length > 0 ? 'drained' : 'active';
      return asResult({ state, notes: ['drain_strategy', event.strategy] });
    case 'route_plan':
      state = event.windows.length > 2 ? 'active' : 'start';
      return asResult({ state, windows: event.windows });
    case 'escalate':
      state = event.urgency > 7 ? 'escalated' : 'guarded';
      return asResult({ state, urgency: event.urgency });
    case 'stabilize':
      state = event.targetMs > 300 ? 'resolved' : 'active';
      return asResult({ state, targetMs: event.targetMs });
    default:
      return asResult({ state: 'failed', notes: ['unknown'] });
  }
};

export const evaluateFlowGraph = (events: readonly BranchEvent[]): Array<BranchResult<BranchEvent>> => {
  const output: Array<BranchResult<BranchEvent>> = [];
  let state: BranchState = 'start';

  for (const event of events) {
    if (state === 'failed' && event.kind !== 'boot' && event.kind !== 'retry') {
      continue;
    }
    if ((state as string) === 'resolved' && event.kind === 'notify') {
      continue;
    }
    if ((state as string) === 'drained' && event.kind === 'drain') {
      continue;
    }

    const next = evaluateBranchFlow(event);
    output.push(next);

    if ((next.state as BranchState) === 'failed') {
      state = 'failed';
    }
    if ((next.state as BranchState) === 'escalated') {
      state = 'escalated';
    }
    if ((next.state as BranchState) === 'resolved') {
      state = 'resolved';
    }
    if ((next.state as BranchState) === 'drained') {
      state = 'drained';
    }
    if (shouldEscalate(state, event)) {
      state = 'escalated';
    }
  }

  return output;
};

const asEvent = <T extends BranchEvent>(value: T): T => value;

export const branchCatalog = [
  asEvent({
    kind: 'boot',
    source: 'atlas',
    tenant: 'tenant-a',
    index: 0,
    mode: 'strict',
    canary: true,
  }),
  asEvent({
    kind: 'scan',
    source: 'fabric',
    tenant: 'tenant-a',
    index: 1,
    mode: 'diagnostic',
    items: ['node', 'edge'],
  }),
  asEvent({
    kind: 'classify',
    source: 'fabric',
    tenant: 'tenant-a',
    index: 2,
    mode: 'strict',
    confidence: 0.94,
  }),
  asEvent({
    kind: 'assess',
    source: 'incident',
    tenant: 'tenant-a',
    index: 3,
    mode: 'strict',
    score: 0.77,
  }),
  asEvent({
    kind: 'notify',
    source: 'incident',
    tenant: 'tenant-a',
    index: 4,
    mode: 'lax',
    channels: ['webhook', 'pager'],
  }),
  asEvent({
    kind: 'replay',
    source: 'ops',
    tenant: 'tenant-a',
    index: 5,
    mode: 'lax',
    seed: 7,
  }),
  asEvent({
    kind: 'rollback',
    source: 'recovery',
    tenant: 'tenant-a',
    index: 6,
    mode: 'strict',
    checkpoint: 'checkpoint-7',
  }),
  asEvent({
    kind: 'complete',
    source: 'ops',
    tenant: 'tenant-a',
    index: 7,
    mode: 'strict',
    exitCode: 0,
  }),
  asEvent({
    kind: 'degrade',
    source: 'ops',
    tenant: 'tenant-a',
    index: 8,
    mode: 'strict',
    degradeLevel: 5,
  }),
  asEvent({
    kind: 'abort',
    source: 'ops',
    tenant: 'tenant-a',
    index: 9,
    mode: 'strict',
    abortCode: 'AB-09',
  }),
  asEvent({
    kind: 'route',
    source: 'ops',
    tenant: 'tenant-a',
    index: 10,
    mode: 'lax',
    target: '/control/route',
  }),
  asEvent({
    kind: 'throttle_window',
    source: 'ops',
    tenant: 'tenant-a',
    index: 11,
    mode: 'diagnostic',
    hitRate: 0.18,
  }),
  asEvent({
    kind: 'escalate',
    source: 'ops',
    tenant: 'tenant-a',
    index: 12,
    mode: 'strict',
    urgency: 9,
  }),
  asEvent({
    kind: 'route_plan',
    source: 'ops',
    tenant: 'tenant-a',
    index: 13,
    mode: 'sim',
    windows: [1, 2, 3, 4],
  }),
  asEvent({
    kind: 'stabilize',
    source: 'ops',
    tenant: 'tenant-a',
    index: 14,
    mode: 'diagnostic',
    targetMs: 300,
  }),
  asEvent({
    kind: 'hold',
    source: 'ops',
    tenant: 'tenant-a',
    index: 15,
    mode: 'strict',
    holdBy: 'recovery-team',
  }),
] as const;

export const evaluateBranchCatalog = (): Array<BranchResult<BranchEvent>> => evaluateFlowGraph(branchCatalog);
