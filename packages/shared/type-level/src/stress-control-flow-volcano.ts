export type StormMode =
  | 'bootstrap'
  | 'discover'
  | 'assess'
  | 'synchronize'
  | 'sweep'
  | 'repair'
  | 'recover'
  | 'route'
  | 'notify'
  | 'simulate'
  | 'archive'
  | 'verify'
  | 'rollback'
  | 'quiesce'
  | 'escalate'
  | 'stabilize'
  | 'calibrate'
  | 'probe'
  | 'drain'
  | 'evict'
  | 'refresh'
  | 'reconcile'
  | 'inspect'
  | 'reassign'
  | 'suspend'
  | 'resume'
  | 'handoff'
  | 'promote'
  | 'fallback'
  | 'throttle'
  | 'audit'
  | 'safeguard'
  | 'reindex'
  | 'remediate'
  | 'notify-ops'
  | 'notify-user'
  | 'notify-external'
  | 'prewarm'
  | 'postrun'
  | 'finalize'
  | 'retire';

export interface FlowEnvelope {
  readonly mode: StormMode;
  readonly tenant: string;
  readonly severity: 'low' | 'high' | 'critical' | 'catastrophic';
  readonly routeId: string;
  readonly count: number;
}

export interface FlowDecision {
  readonly accepted: boolean;
  readonly score: number;
  readonly branch: string;
  readonly notes: readonly string[];
  readonly shouldRetry: boolean;
}

const risk = (mode: FlowEnvelope['severity']): number => {
  switch (mode) {
    case 'low':
      return 1;
    case 'high':
      return 2;
    case 'critical':
      return 3;
    case 'catastrophic':
      return 4;
    default:
      return 1;
  }
};

const branchByMode = (mode: StormMode): string => {
  if (mode === 'bootstrap') return 'start-up';
  if (mode === 'discover') return 'lookup';
  if (mode === 'assess') return 'analyze';
  if (mode === 'synchronize') return 'sync';
  if (mode === 'sweep') return 'inventory';
  if (mode === 'repair') return 'patch';
  if (mode === 'recover') return 'heal';
  if (mode === 'route') return 'reroute';
  if (mode === 'notify') return 'broadcast';
  if (mode === 'simulate') return 'drift';
  if (mode === 'archive') return 'seal';
  if (mode === 'verify') return 'assert';
  if (mode === 'rollback') return 'rewind';
  if (mode === 'quiesce') return 'cooldown';
  if (mode === 'escalate') return 'raise';
  if (mode === 'stabilize') return 'dampen';
  if (mode === 'calibrate') return 'align';
  if (mode === 'probe') return 'probe';
  if (mode === 'drain') return 'drain';
  if (mode === 'evict') return 'evict';
  if (mode === 'refresh') return 'refresh';
  if (mode === 'reconcile') return 'merge';
  if (mode === 'inspect') return 'inspect';
  if (mode === 'reassign') return 'reassign';
  if (mode === 'suspend') return 'pause';
  if (mode === 'resume') return 'resume';
  if (mode === 'handoff') return 'handoff';
  if (mode === 'promote') return 'promote';
  if (mode === 'fallback') return 'fallback';
  if (mode === 'throttle') return 'throttle';
  if (mode === 'audit') return 'audit';
  if (mode === 'safeguard') return 'safeguard';
  if (mode === 'reindex') return 'reindex';
  if (mode === 'remediate') return 'remediate';
  if (mode === 'notify-ops') return 'notify-ops';
  if (mode === 'notify-user') return 'notify-user';
  if (mode === 'notify-external') return 'notify-external';
  if (mode === 'prewarm') return 'prewarm';
  if (mode === 'postrun') return 'postrun';
  if (mode === 'finalize') return 'finalize';
  if (mode === 'retire') return 'retire';
  return 'fallback';
};

export const computeFlowDecision = (event: FlowEnvelope): FlowDecision => {
  const branch = branchByMode(event.mode);
  const severityScore = risk(event.severity);
  const isRetriable = event.count < 8 && event.severity !== 'catastrophic';

  if (event.mode === 'bootstrap') {
    return { accepted: true, score: 2 + severityScore, branch, notes: ['init'], shouldRetry: true };
  }

  if (event.mode === 'discover') {
    return { accepted: true, score: 5 + severityScore, branch, notes: ['scan'], shouldRetry: true };
  }

  if (event.mode === 'assess') {
    return { accepted: true, score: 6 + severityScore, branch, notes: ['analyzed'], shouldRetry: event.count < 3 };
  }

  if (event.mode === 'synchronize') {
    return { accepted: true, score: 7 + severityScore, branch, notes: ['sync'], shouldRetry: true };
  }

  if (event.mode === 'sweep') {
    return { accepted: true, score: 4 + severityScore, branch, notes: ['swept'], shouldRetry: false };
  }

  if (event.mode === 'repair') {
    return { accepted: event.count % 2 === 0, score: 9 + severityScore, branch, notes: ['patched'], shouldRetry: true };
  }

  if (event.mode === 'recover') {
    return { accepted: true, score: 11 + severityScore, branch, notes: ['recovered'], shouldRetry: event.count < 2 };
  }

  if (event.mode === 'route') {
    return { accepted: true, score: 4 + severityScore, branch, notes: ['routed'], shouldRetry: event.count < 6 };
  }

  if (event.mode === 'notify') {
    return { accepted: true, score: 2 + severityScore, branch, notes: ['notified'], shouldRetry: false };
  }

  if (event.mode === 'simulate') {
    return { accepted: true, score: 8 + severityScore, branch, notes: ['simulated'], shouldRetry: event.count < 5 };
  }

  if (event.mode === 'archive') {
    return { accepted: true, score: 3 + severityScore, branch, notes: ['stored'], shouldRetry: false };
  }

  if (event.mode === 'verify') {
    return { accepted: event.routeId.length > 1, score: 5 + severityScore, branch, notes: ['checked'], shouldRetry: event.count < 2 };
  }

  if (event.mode === 'rollback') {
    return { accepted: event.tenant.startsWith('tenant-'), score: 14 + severityScore, branch, notes: ['rewound'], shouldRetry: true };
  }

  if (event.mode === 'quiesce') {
    return { accepted: true, score: 5 + severityScore, branch, notes: ['cooled'], shouldRetry: event.count < 4 };
  }

  if (event.mode === 'escalate') {
    return { accepted: event.severity === 'critical' || event.severity === 'catastrophic', score: 15 + severityScore, branch, notes: ['raised'], shouldRetry: true };
  }

  if (event.mode === 'stabilize') {
    return { accepted: true, score: 7 + severityScore, branch, notes: ['stabilized'], shouldRetry: event.count < 3 };
  }

  if (event.mode === 'calibrate') {
    return { accepted: true, score: 6 + severityScore, branch, notes: ['calibrated'], shouldRetry: true };
  }

  if (event.mode === 'probe') {
    return { accepted: true, score: 9 + severityScore, branch, notes: ['probed'], shouldRetry: true };
  }

  if (event.mode === 'drain') {
    return { accepted: event.count > 0, score: 4 + severityScore, branch, notes: ['drained'], shouldRetry: false };
  }

  if (event.mode === 'evict') {
    return { accepted: true, score: 12 + severityScore, branch, notes: ['evicted'], shouldRetry: true };
  }

  if (event.mode === 'refresh') {
    return { accepted: true, score: 5 + severityScore, branch, notes: ['refreshed'], shouldRetry: true };
  }

  if (event.mode === 'reconcile') {
    return { accepted: event.routeId.length % 2 === 0, score: 10 + severityScore, branch, notes: ['reconciled'], shouldRetry: false };
  }

  if (event.mode === 'inspect') {
    return { accepted: true, score: 6 + severityScore, branch, notes: ['inspected'], shouldRetry: false };
  }

  if (event.mode === 'reassign') {
    return { accepted: true, score: 8 + severityScore, branch, notes: ['reassigned'], shouldRetry: true };
  }

  if (event.mode === 'suspend') {
    return { accepted: event.count < 10, score: 5 + severityScore, branch, notes: ['suspended'], shouldRetry: true };
  }

  if (event.mode === 'resume') {
    return { accepted: true, score: 6 + severityScore, branch, notes: ['resumed'], shouldRetry: true };
  }

  if (event.mode === 'handoff') {
    return { accepted: true, score: 7 + severityScore, branch, notes: ['handoff'], shouldRetry: true };
  }

  if (event.mode === 'promote') {
    return { accepted: event.severity !== 'low', score: 10 + severityScore, branch, notes: ['promoted'], shouldRetry: false };
  }

  if (event.mode === 'fallback') {
    return { accepted: true, score: 6 + severityScore, branch, notes: ['fallback'], shouldRetry: true };
  }

  if (event.mode === 'throttle') {
    return { accepted: true, score: 9 + severityScore, branch, notes: ['throttled'], shouldRetry: true };
  }

  if (event.mode === 'audit') {
    return { accepted: true, score: 4 + severityScore, branch, notes: ['audited'], shouldRetry: false };
  }

  if (event.mode === 'safeguard') {
    return { accepted: event.severity !== 'low', score: 8 + severityScore, branch, notes: ['guarded'], shouldRetry: true };
  }

  if (event.mode === 'reindex') {
    return { accepted: true, score: 5 + severityScore, branch, notes: ['reindexed'], shouldRetry: true };
  }

  if (event.mode === 'remediate') {
    return { accepted: event.count <= 7, score: 11 + severityScore, branch, notes: ['remediated'], shouldRetry: true };
  }

  if (event.mode === 'notify-ops') {
    return { accepted: true, score: 4 + severityScore, branch, notes: ['ops-alert'], shouldRetry: false };
  }

  if (event.mode === 'notify-user') {
    return { accepted: true, score: 3 + severityScore, branch, notes: ['user-alert'], shouldRetry: false };
  }

  if (event.mode === 'notify-external') {
    return { accepted: true, score: 3 + severityScore, branch, notes: ['external-alert'], shouldRetry: true };
  }

  if (event.mode === 'prewarm') {
    return { accepted: true, score: 4 + severityScore, branch, notes: ['prewarmed'], shouldRetry: false };
  }

  if (event.mode === 'postrun') {
    return { accepted: true, score: 4 + severityScore, branch, notes: ['postrun'], shouldRetry: false };
  }

  if (event.mode === 'finalize') {
    return { accepted: true, score: 5 + severityScore, branch, notes: ['finalized'], shouldRetry: false };
  }

  if (event.mode === 'retire') {
    return { accepted: true, score: 6 + severityScore, branch, notes: ['retired'], shouldRetry: false };
  }

  return { accepted: false, score: 0, branch: 'fallback', notes: ['unknown'], shouldRetry: false };
};

export type FlowTrace = {
  readonly envelope: FlowEnvelope;
  readonly decision: FlowDecision;
  readonly traceId: string;
};

export const runControlFlowVolcano = (events: readonly FlowEnvelope[]): FlowTrace[] => {
  const traces: FlowTrace[] = [];

  for (const event of events) {
    try {
      const decision = computeFlowDecision(event);
      const noteSet = new Set(decision.notes);
      const tags: string[] = [];

      for (const note of noteSet) {
        tags.push(`${event.tenant}:${note}`);
      }

      const shouldYield =
        (event.count > 0 && decision.accepted) ||
        (event.count > 1 && decision.shouldRetry) ||
        (event.severity === 'catastrophic' && event.routeId !== '') ||
        (event.mode.startsWith('notify') && event.severity === 'low');

      if (decision.accepted && shouldYield) {
        for (const tag of tags) {
          traces.push({
            envelope: event,
            decision,
            traceId: `${tag}:${decision.score}`,
          });
        }
      } else {
        traces.push({
          envelope: event,
          decision: {
            ...decision,
            shouldRetry: false,
            notes: [...tags],
          },
          traceId: `fallback:${decision.branch}:${event.tenant}`,
        });
      }

      continue;
    } catch {
      traces.push({
        envelope: event,
        decision: {
          accepted: false,
          score: 0,
          branch: 'panic',
          notes: ['exception'],
          shouldRetry: true,
        },
        traceId: `panic:${event.tenant}:${event.routeId}`,
      });
    }
  }

  return traces;
};

export const defaultFlowEnvelope = {
  mode: 'discover',
  tenant: 'tenant-ops',
  severity: 'high',
  routeId: 'R-100',
  count: 1,
} as const satisfies FlowEnvelope;

export const defaultFlowRun = runControlFlowVolcano([
  defaultFlowEnvelope,
  { ...defaultFlowEnvelope, mode: 'repair', routeId: 'R-101', count: 2, severity: 'critical' },
  { ...defaultFlowEnvelope, mode: 'escalate', routeId: 'R-102', count: 3, severity: 'catastrophic' },
  { ...defaultFlowEnvelope, mode: 'notify-ops', routeId: 'R-103', count: 0, severity: 'low' },
  { ...defaultFlowEnvelope, mode: 'retire', routeId: 'R-104', count: 5, severity: 'high' },
]);
