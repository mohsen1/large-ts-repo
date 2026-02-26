import type { DeeperProfile } from './stress-orchestrator-mesh';
import type { ParseRouteTemplate, RouteTemplateUnion } from './stress-template-map-recursion';
import type { Brand } from './patterns';

type SeverityValue = 'low' | 'moderate' | 'high' | 'critical' | 'emergency';

type BroadcastEvent =
  | { readonly kind: 'command.received'; readonly route: RouteTemplateUnion; readonly confidence: number; readonly load: number }
  | { readonly kind: 'command.debounced'; readonly route: RouteTemplateUnion; readonly delayMs: number }
  | { readonly kind: 'command.routed'; readonly route: RouteTemplateUnion; readonly destination: string }
  | { readonly kind: 'command.rejected'; readonly route: RouteTemplateUnion; readonly reason: 'timeout' | 'invalid' | 'forbidden' }
  | { readonly kind: 'command.queued'; readonly route: RouteTemplateUnion; readonly queue: Brand<string, 'queue-id'> }
  | { readonly kind: 'command.dispatched'; readonly route: RouteTemplateUnion; readonly destination: string; readonly priority: number }
  | { readonly kind: 'command.acknowledged'; readonly route: RouteTemplateUnion; readonly ack: true }
  | { readonly kind: 'command.completed'; readonly route: RouteTemplateUnion; readonly outcome: 'ok' | 'noop'; readonly code: number }
  | { readonly kind: 'command.failed'; readonly route: RouteTemplateUnion; readonly error: string }
  | { readonly kind: 'command.retried'; readonly route: RouteTemplateUnion; readonly attempts: number }
  | { readonly kind: 'command.cancelled'; readonly route: RouteTemplateUnion; readonly reason: 'manual' | 'superceded' }
  | { readonly kind: 'command.suppressed'; readonly route: RouteTemplateUnion; readonly reason: 'noise' }
  | { readonly kind: 'telemetry.published'; readonly route: RouteTemplateUnion; readonly value: number }
  | { readonly kind: 'telemetry.skipped'; readonly route: RouteTemplateUnion; readonly reason: string }
  | { readonly kind: 'policy.approved'; readonly route: RouteTemplateUnion; readonly approver: string }
  | { readonly kind: 'policy.denied'; readonly route: RouteTemplateUnion; readonly approver: string; readonly details: string }
  | { readonly kind: 'policy.escalated'; readonly route: RouteTemplateUnion; readonly level: 'ops' | 'sec' }
  | { readonly kind: 'mesh.joined'; readonly route: RouteTemplateUnion; readonly endpoint: string }
  | { readonly kind: 'mesh.left'; readonly route: RouteTemplateUnion; readonly endpoint: string }
  | { readonly kind: 'mesh.rebalanced'; readonly route: RouteTemplateUnion; readonly partitions: number }
  | { readonly kind: 'mesh.overloaded'; readonly route: RouteTemplateUnion; readonly pressure: number }
  | { readonly kind: 'mesh.recovered'; readonly route: RouteTemplateUnion }
  | { readonly kind: 'timeline.entered'; readonly route: RouteTemplateUnion; readonly stage: string }
  | { readonly kind: 'timeline.left'; readonly route: RouteTemplateUnion; readonly stage: string }
  | { readonly kind: 'timeline.stalled'; readonly route: RouteTemplateUnion; readonly minutes: number }
  | { readonly kind: 'orchestrator.wait'; readonly route: RouteTemplateUnion; readonly waitMs: number }
  | { readonly kind: 'orchestrator.resume'; readonly route: RouteTemplateUnion; readonly token: string }
  | { readonly kind: 'orchestrator.forked'; readonly route: RouteTemplateUnion; readonly branch: string }
  | { readonly kind: 'orchestrator.joined'; readonly route: RouteTemplateUnion; readonly branchCount: number }
  | { readonly kind: 'fabric.preflight'; readonly route: RouteTemplateUnion; readonly checks: number }
  | { readonly kind: 'fabric.deploy'; readonly route: RouteTemplateUnion; readonly version: string }
  | { readonly kind: 'fabric.rollback'; readonly route: RouteTemplateUnion; readonly version: string }
  | { readonly kind: 'fabric.failed'; readonly route: RouteTemplateUnion; readonly reason: string }
  | { readonly kind: 'analytics.emailed'; readonly route: RouteTemplateUnion; readonly recipients: number }
  | { readonly kind: 'analytics.smsed'; readonly route: RouteTemplateUnion; readonly recipients: number }
  | { readonly kind: 'analytics.signed'; readonly route: RouteTemplateUnion; readonly hash: Brand<string, 'hash'> }
  | { readonly kind: 'incident.opened'; readonly route: RouteTemplateUnion; readonly severity: SeverityValue }
  | { readonly kind: 'incident.resolved'; readonly route: RouteTemplateUnion; readonly durationMs: number }
  | { readonly kind: 'incident.paged'; readonly route: RouteTemplateUnion; readonly pager: string };

export type BroadcastEnvelope = {
  readonly id: Brand<string, 'broadcast-id'>;
  readonly event: BroadcastEvent;
  readonly profile: DeeperProfile<RouteTemplateUnion, 10>;
  readonly startedAt: Date;
};

export const routeSeverityFromEvent = (event: BroadcastEvent): RouteSeverity => {
  switch (event.kind) {
    case 'command.failed': {
      return 'critical';
    }
    case 'command.rejected':
      return event.reason === 'forbidden' ? 'critical' : 'high';
    case 'incident.opened':
      return event.severity;
    case 'incident.paged':
      return 'emergency';
    case 'incident.resolved':
      return 'low';
    case 'mesh.overloaded':
      return event.pressure > 90 ? 'critical' : 'high';
    case 'mesh.joined':
      return 'moderate';
    case 'mesh.left':
      return 'moderate';
    case 'mesh.rebalanced':
      return event.partitions > 6 ? 'high' : 'moderate';
    case 'mesh.recovered':
      return 'low';
    case 'timeline.stalled':
      return event.minutes > 12 ? 'high' : 'moderate';
    case 'timeline.left':
      return 'low';
    case 'timeline.entered':
      return event.stage === 'finalize' ? 'high' : 'moderate';
    case 'orchestrator.wait':
      return event.waitMs > 400 ? 'moderate' : 'low';
    case 'orchestrator.resume':
      return 'low';
    case 'orchestrator.forked':
      return event.branch === 'chaos' ? 'high' : 'moderate';
    case 'orchestrator.joined':
      return event.branchCount > 4 ? 'high' : 'low';
    case 'fabric.preflight':
      return event.checks > 4 ? 'moderate' : 'low';
    case 'fabric.deploy':
      return 'low';
    case 'fabric.rollback':
      return 'high';
    case 'fabric.failed':
      return 'high';
    case 'analytics.emailed':
      return event.recipients > 3 ? 'low' : 'low';
    case 'analytics.smsed':
      return event.recipients > 2 ? 'moderate' : 'low';
    case 'analytics.signed':
      return 'low';
    case 'policy.approved':
      return 'low';
    case 'policy.denied':
      return event.approver ? 'high' : 'critical';
    case 'policy.escalated':
      return event.level === 'sec' ? 'critical' : 'high';
    case 'command.received':
      return event.confidence > 5 ? 'moderate' : 'low';
    case 'command.debounced':
      return event.delayMs > 100 ? 'moderate' : 'low';
    case 'command.routed':
      return event.destination === 'critical-path' ? 'high' : 'low';
    case 'command.queued':
      return event.queue.includes('critical') ? 'high' : 'low';
    case 'command.dispatched':
      return event.priority > 7 ? 'high' : 'moderate';
    case 'command.acknowledged':
      return 'low';
    case 'command.completed':
      return event.code >= 500 ? 'high' : 'low';
    case 'command.retried':
      return event.attempts > 3 ? 'high' : 'moderate';
    case 'command.cancelled':
      return event.reason === 'manual' ? 'low' : 'moderate';
    case 'command.suppressed':
      return 'low';
    case 'telemetry.published':
      return event.value > 90 ? 'high' : 'moderate';
    case 'telemetry.skipped':
      return event.reason ? 'low' : 'low';
    default:
      return 'low';
  }
};

export type RouteSeverity = 'low' | 'moderate' | 'high' | 'critical' | 'emergency';

export type BroadcastOutcome =
  | { readonly kind: 'accept'; readonly severity: RouteSeverity }
  | { readonly kind: 'reject'; readonly severity: RouteSeverity; readonly reason: string }
  | { readonly kind: 'retry'; readonly severity: RouteSeverity; readonly retryInMs: number };

export const evaluateBroadcast = (events: readonly BroadcastEvent[]): BroadcastOutcome[] => {
  const outcomes: BroadcastOutcome[] = [];
  const seen = new Set<RouteTemplateUnion>();

  for (const event of events) {
    const parsed = resolveRoute(event.route);
    const routeKey = `${event.route}` as RouteTemplateUnion;

    if (event.kind.startsWith('command.') && parsed.mode === 'dry-run' && !seen.has(routeKey)) {
      outcomes.push({ kind: 'accept', severity: 'moderate' });
      seen.add(routeKey);
      continue;
    }

    if (event.kind.endsWith('failed') || event.kind.endsWith('forbidden')) {
      outcomes.push({ kind: 'retry', severity: routeSeverityFromEvent(event), retryInMs: 1200 + seen.size * 100 });
      continue;
    }

    if (parsed.severity === 'critical') {
      outcomes.push({ kind: 'reject', severity: 'critical', reason: `critical route ${routeKey}` });
      continue;
    }

    if (event.kind === 'incident.opened') {
      if (event.severity === 'critical' || event.severity === 'emergency') {
        outcomes.push({ kind: 'retry', severity: 'critical', retryInMs: 0 });
      } else {
        outcomes.push({ kind: 'accept', severity: 'moderate' });
      }
      continue;
    }

    if (event.kind === 'policy.denied') {
      outcomes.push({ kind: 'reject', severity: 'high', reason: event.details });
      continue;
    }

    if (event.kind === 'mesh.overloaded') {
      if (event.pressure > 70 && seen.has(routeKey)) {
        outcomes.push({ kind: 'retry', severity: 'high', retryInMs: 5000 });
      } else {
        outcomes.push({ kind: 'accept', severity: 'low' });
      }
      continue;
    }

    if (event.kind === 'fabric.failed' && seen.size > 4) {
      outcomes.push({ kind: 'retry', severity: 'high', retryInMs: 8000 });
      continue;
    }

    if (event.kind === 'timeline.stalled' && event.minutes > 15) {
      outcomes.push({ kind: 'retry', severity: 'moderate', retryInMs: 1000 * event.minutes });
      continue;
    }

    if (event.kind === 'orchestrator.wait' && event.waitMs > 100) {
      outcomes.push({ kind: 'accept', severity: 'low' });
      continue;
    }

    if ((event.kind === 'fabric.deploy' || event.kind === 'fabric.rollback') && event.route.includes('live')) {
      outcomes.push({ kind: 'accept', severity: 'low' });
      continue;
    }

    if (event.kind === 'telemetry.published' && event.value > 85) {
      outcomes.push({ kind: 'retry', severity: 'moderate', retryInMs: 3000 });
      continue;
    }

    if (event.kind === 'command.completed' && event.code === 200) {
      outcomes.push({ kind: 'accept', severity: 'low' });
      continue;
    }

    if (event.kind === 'command.completed' && event.code !== 200) {
      outcomes.push({ kind: 'retry', severity: 'high', retryInMs: 900 });
      continue;
    }

    if (event.kind === 'command.retried' && event.attempts > 2) {
      outcomes.push({ kind: 'reject', severity: 'high', reason: `attempts=${event.attempts}` });
      continue;
    }

    if (event.kind === 'command.cancelled') {
      outcomes.push({ kind: 'accept', severity: event.reason === 'manual' ? 'low' : 'moderate' });
      continue;
    }

    if (event.kind === 'command.queued' && event.queue.startsWith('q_critical')) {
      outcomes.push({ kind: 'retry', severity: 'high', retryInMs: 2000 });
      continue;
    }

    if (event.kind === 'timeline.left') {
      outcomes.push({ kind: 'accept', severity: 'low' });
      continue;
    }

    if (event.kind === 'telemetry.skipped' && event.reason === 'missing') {
      outcomes.push({ kind: 'reject', severity: 'moderate', reason: 'missing telemetry data' });
      continue;
    }

    if (event.kind === 'orchestrator.joined' && event.branchCount > 2) {
      outcomes.push({ kind: 'accept', severity: 'moderate' });
      continue;
    }

    if (event.kind === 'analytics.signed') {
      outcomes.push({ kind: 'accept', severity: 'low' });
      continue;
    }

    if (event.kind === 'incident.resolved' && event.durationMs > 30000) {
      outcomes.push({ kind: 'accept', severity: 'low' });
      continue;
    }

    if (event.kind === 'policy.approved') {
      outcomes.push({ kind: 'accept', severity: 'low' });
      continue;
    }

    if (event.kind === 'analytics.emailed' && event.recipients > 4) {
      outcomes.push({ kind: 'accept', severity: 'low' });
      continue;
    }

    if (event.kind === 'analytics.smsed' && event.recipients > 3) {
      outcomes.push({ kind: 'retry', severity: 'low', retryInMs: 300 });
      continue;
    }

    outcomes.push({ kind: 'accept', severity: 'low' });
  }

  return outcomes;
};

export const resolveRoute = <T extends RouteTemplateUnion>(route: T): ParseRouteTemplate<T> => {
  const [root, domain, verb, mode, severity] = route.split('/') as [
    string,
    string,
    string,
    string,
    string,
  ];

  const parsed = {
    domain,
    verb,
    mode,
    severity,
  } as ParseRouteTemplate<T>;

  if (!(root && domain && verb && mode && severity)) {
    throw new Error(`invalid route ${route}`);
  }

  return parsed;
};

export const runBroadcast = (seed: readonly BroadcastEvent[]): ReadonlyArray<RouteTemplateUnion> => {
  const results: RouteTemplateUnion[] = [];
  const seenKinds = new Set<string>();
  const profile: DeeperProfile<RouteTemplateUnion, 4> = {
    key: 'depth-4',
    source: '/agent/discover/live/low',
    next: {
      key: 'depth-3',
      source: '/mesh/dispatch/simulation/high',
      next: {
        key: 'depth-2',
        source: '/signal/heal/replay/critical',
        next: {
          key: 'depth-1',
          source: '/policy/verify/backfill/moderate',
            next: {
              key: 'depth-0',
              source: '/fabric/throttle/simulation/high',
              next: undefined as never,
            },
        },
      },
    },
  };

  for (const item of seed) {
    if ((item.route && item.route.startsWith('/')) === false || seenKinds.has(item.kind)) {
      continue;
    }

    seenKinds.add(item.kind);
    const currentProfile = resolveRoute(item.route);
    const hasLowConfidence = 'confidence' in item && item.confidence < 3;
    const isHighPriority = (item.kind.includes('failed') || item.kind.includes('critical')) && hasLowConfidence;

    if (currentProfile.domain && (isHighPriority || (item.route.includes('critical') || seenKinds.size > 2))) {
      results.push(item.route);
    }

    if (item.kind === 'command.queued') {
      const queue = (item as Extract<BroadcastEvent, { kind: 'command.queued' }>).queue;
      if (queue.includes('critical') && hasLowConfidence) {
        results.push(item.route);
      }
    }

    if (item.kind === 'mesh.overloaded' && (item as Extract<BroadcastEvent, { kind: 'mesh.overloaded' }>).pressure > 80) {
      results.push(item.route);
    }

    if (item.kind === 'incident.opened' && profile.source === item.route && profile.next.source === item.route) {
      results.push(item.route);
    }
  }

  return results;
};

export const broadcastMatrix = runBroadcast(
  [
    { kind: 'command.received', route: '/agent/discover/live/low', confidence: 6, load: 13 },
    { kind: 'command.failed', route: '/mesh/dispatch/simulation/high', error: 'temporary-failure' },
    { kind: 'mesh.overloaded', route: '/fabric/throttle/simulation/high', pressure: 88 },
    { kind: 'incident.opened', route: '/incident/recover/live/emergency', severity: 'critical' },
    { kind: 'policy.denied', route: '/policy/verify/backfill/moderate', approver: 'ops', details: 'rule blocked' },
    { kind: 'command.cancelled', route: '/timeline/plan/simulation/high', reason: 'manual' },
  ] as const,
);
