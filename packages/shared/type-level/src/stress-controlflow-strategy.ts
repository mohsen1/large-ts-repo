export type Opcode =
  | 'discover'
  | 'assess'
  | 'simulate'
  | 'mitigate'
  | 'rollback'
  | 'restore'
  | 'drain'
  | 'safeguard'
  | 'isolate'
  | 'repair'
  | 'verify'
  | 'report'
  | 'notify'
  | 'archive';

export interface BaseEvent {
  readonly opcode: Opcode;
  readonly tenant: string;
  readonly ts: number;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
}

export type DiscoveryEvent = BaseEvent & { opcode: 'discover'; zone: 'us' | 'eu' | 'apac'; entity: string };
export type AssessEvent = BaseEvent & { opcode: 'assess'; score: number; note?: string };
export type SimulateEvent = BaseEvent & { opcode: 'simulate'; dryRun: boolean; scenario: string };
export type MitigateEvent = BaseEvent & { opcode: 'mitigate'; policy: string; force: boolean };
export type RollbackEvent = BaseEvent & { opcode: 'rollback'; planId: string; approvals: readonly string[] };
export type RestoreEvent = BaseEvent & { opcode: 'restore'; runbook: string };
export type DrainEvent = BaseEvent & { opcode: 'drain'; timeoutMs: number };
export type SafeguardEvent = BaseEvent & { opcode: 'safeguard'; mode: 'soft' | 'hard' };
export type IsolateEvent = BaseEvent & { opcode: 'isolate'; resource: string; region: string };
export type RepairEvent = BaseEvent & { opcode: 'repair'; strategy: string; owner?: string };
export type VerifyEvent = BaseEvent & { opcode: 'verify'; checks: readonly string[] };
export type ReportEvent = BaseEvent & { opcode: 'report'; summary: string; recipients: readonly string[] };
export type NotifyEvent = BaseEvent & { opcode: 'notify'; channels: readonly ('email' | 'pager' | 'webhook')[] };
export type ArchiveEvent = BaseEvent & { opcode: 'archive'; reason: string; checksum: string };

export type RecoveryEvent =
  | DiscoveryEvent
  | AssessEvent
  | SimulateEvent
  | MitigateEvent
  | RollbackEvent
  | RestoreEvent
  | DrainEvent
  | SafeguardEvent
  | IsolateEvent
  | RepairEvent
  | VerifyEvent
  | ReportEvent
  | NotifyEvent
  | ArchiveEvent;

export type ResolvedEvent<T extends Opcode> =
  T extends 'discover'
    ? DiscoveryEvent
    : T extends 'assess'
      ? AssessEvent
      : T extends 'simulate'
        ? SimulateEvent
        : T extends 'mitigate'
          ? MitigateEvent
          : T extends 'rollback'
            ? RollbackEvent
            : T extends 'restore'
              ? RestoreEvent
              : T extends 'drain'
                ? DrainEvent
                : T extends 'safeguard'
                  ? SafeguardEvent
                  : T extends 'isolate'
                    ? IsolateEvent
                    : T extends 'repair'
                      ? RepairEvent
                      : T extends 'verify'
                        ? VerifyEvent
                        : T extends 'report'
                          ? ReportEvent
                          : T extends 'notify'
                            ? NotifyEvent
                            : ArchiveEvent;

export type ExhaustiveBranch<T extends RecoveryEvent> = T['opcode'] extends 'discover'
  ? 'discover'
  : T['opcode'] extends 'assess'
    ? 'assess'
    : T['opcode'] extends 'simulate'
      ? 'simulate'
      : T['opcode'] extends 'mitigate'
        ? 'mitigate'
        : T['opcode'] extends 'rollback'
          ? 'rollback'
          : T['opcode'] extends 'restore'
            ? 'restore'
            : T['opcode'] extends 'drain'
              ? 'drain'
              : T['opcode'] extends 'safeguard'
                ? 'safeguard'
                : T['opcode'] extends 'isolate'
                  ? 'isolate'
                  : T['opcode'] extends 'repair'
                    ? 'repair'
                    : T['opcode'] extends 'verify'
                      ? 'verify'
                      : T['opcode'] extends 'report'
                        ? 'report'
                        : T['opcode'] extends 'notify'
                          ? 'notify'
                          : T['opcode'] extends 'archive'
                            ? 'archive'
                            : never;

export const evaluateSeverity = (severity: BaseEvent['severity']) =>
  severity === 'critical'
    ? 'urgent'
    : severity === 'high'
      ? 'high'
      : severity === 'medium'
        ? 'normal'
        : 'low';

const baseMetadata = {
  region: 'global',
  owner: 'system',
  environment: 'prod',
};

export const buildResolution = (event: RecoveryEvent): string => {
  let action = 'noop';
  let attempts = 0;

  while (attempts < 3) {
    attempts += 1;

    try {
      if (event.severity === 'critical' && event.opcode === 'discover') {
        action = `critical-discover-${event.zone}`;
        break;
      }

      if (event.severity === 'high' && event.opcode === 'assess' && event.score >= 80) {
        action = `priority-assess-${event.score}`;
        break;
      }

      if (event.opcode === 'rollback') {
        const hasApproval = Boolean(event.approvals.length);
        if (!hasApproval) {
          action = 'rollback-needs-approval';
          break;
        }

        if (event.approvals.length > 2 && event.tenant.length > 0) {
          action = `rollback-approved-${event.tenant}`;
          break;
        }

        action = 'rollback-awaiting-ratification';
        break;
      }

      if (event.opcode === 'simulate') {
        action = event.dryRun ? 'simulate-dry-run' : `simulate-real-${event.scenario}`;
      } else if (event.opcode === 'notify') {
        if (event.channels.includes('pager')) {
          action = `notify-pager-${event.channels.length}`;
        } else if (event.channels.includes('webhook')) {
          action = 'notify-webhook';
        } else if (event.channels.includes('email')) {
          action = 'notify-email';
        } else {
          action = 'notify-none';
        }
      } else if (event.opcode === 'assess') {
        action = event.score > 90 ? 'assess-golden' : `assess-${event.score % 5}`;
      } else if (event.opcode === 'archive') {
        action = event.reason ? `archive-${event.reason}` : 'archive-untagged';
      } else if (event.opcode === 'verify') {
        action = event.checks.length > 3 ? 'verify-deep' : 'verify-quick';
      } else if (event.opcode === 'mitigate') {
        action = event.force ? 'mitigate-force' : `mitigate-${event.policy}`;
      } else if (event.opcode === 'isolate') {
        action = `${event.resource}-${event.region}`;
      } else if (event.opcode === 'repair') {
        action = event.owner ? `repair-${event.owner}` : 'repair-unknown';
      } else if (event.opcode === 'restore') {
        action = event.runbook ? `restore-${event.runbook}` : 'restore-inline';
      } else if (event.opcode === 'drain') {
        action = event.timeoutMs > 200 ? 'drain-slow' : 'drain-fast';
      } else if (event.opcode === 'safeguard') {
        action = event.mode === 'hard' ? 'safeguard-hard' : 'safeguard-soft';
      } else if (event.opcode === 'report') {
        action = event.summary.length > 25 ? 'report-detailed' : 'report-compact';
      }

      if (event.severity === 'low' || evaluateSeverity(event.severity) === 'low') {
        action = `low-priority-${action}`;
      }
    } catch (error) {
      action = error instanceof Error ? `error-${error.message}` : 'error-unknown';
      break;
    }
  }

  if (action === 'noop') {
    switch (event.opcode) {
      case 'discover':
        action = event.tenant.includes('lab') ? 'discover-lab' : 'discover-prod';
        break;
      case 'assess':
        action = 'assess-default';
        break;
      case 'simulate':
        action = 'simulate-default';
        break;
      case 'mitigate':
        action = 'mitigate-default';
        break;
      case 'rollback':
        action = 'rollback-default';
        break;
      case 'restore':
        action = 'restore-default';
        break;
      case 'drain':
        action = 'drain-default';
        break;
      case 'safeguard':
        action = 'safeguard-default';
        break;
      case 'isolate':
        action = 'isolate-default';
        break;
      case 'repair':
        action = 'repair-default';
        break;
      case 'verify':
        action = 'verify-default';
        break;
      case 'report':
        action = 'report-default';
        break;
      case 'notify':
        action = 'notify-default';
        break;
      case 'archive':
        action = 'archive-default';
        break;
      default:
        action = 'unknown';
        break;
    }
  }

  return `${baseMetadata.environment}:${baseMetadata.region}:${action}`;
};

export type ResolutionMatrix =
  | { readonly opcode: 'discover'; readonly result: 'critical-discover' | 'discover-lab' | 'discover-prod' }
  | { readonly opcode: 'assess'; readonly result: 'assess-default' | 'assess-golden' | `assess-${number}` }
  | { readonly opcode: 'simulate'; readonly result: 'simulate-dry-run' | 'simulate-real' | 'simulate-default' }
  | { readonly opcode: 'mitigate'; readonly result: 'mitigate-force' | `mitigate-${string}` | 'mitigate-default' }
  | { readonly opcode: 'rollback'; readonly result: 'rollback-approved' | 'rollback-awaiting-ratification' | 'rollback-needs-approval' | 'rollback-default' }
  | { readonly opcode: 'restore'; readonly result: 'restore-inline' | `restore-${string}` | 'restore-default' }
  | { readonly opcode: 'drain'; readonly result: 'drain-slow' | 'drain-fast' | 'drain-default' }
  | { readonly opcode: 'safeguard'; readonly result: 'safeguard-hard' | 'safeguard-soft' | 'safeguard-default' }
  | { readonly opcode: 'isolate'; readonly result: `${string}` }
  | { readonly opcode: 'repair'; readonly result: 'repair-unknown' | `repair-${string}` | 'repair-default' }
  | { readonly opcode: 'verify'; readonly result: 'verify-deep' | 'verify-quick' | 'verify-default' }
  | { readonly opcode: 'report'; readonly result: 'report-detailed' | 'report-compact' | 'report-default' }
  | { readonly opcode: 'notify'; readonly result: `notify-${string}` }
  | { readonly opcode: 'archive'; readonly result: 'archive-default' | `archive-${string}` };

export const runControlGraph = (events: readonly RecoveryEvent[]): ReadonlyMap<string, string> => {
  const outputs = new Map<string, string>();

  for (const event of events) {
    const branch = event.severity === 'critical'
      ? 'critical-path'
      : event.severity === 'high'
        ? 'high-path'
        : event.severity === 'medium'
          ? 'medium-path'
          : 'low-path';

    const resolved = buildResolution(event);
    outputs.set(`${branch}:${event.tenant}:${event.opcode}`, resolved);

    if (branch === 'critical-path') {
      continue;
    }

    if (branch === 'high-path') {
      if (event.opcode === 'rollback') {
        outputs.set(`high:${event.tenant}:rollback`, 'high-rollback-queued');
      }
    }

    if (branch === 'low-path') {
      if (event.opcode === 'simulate' && 'scenario' in event && event.scenario.includes('safe')) {
        outputs.set(`low:${event.tenant}:simulate`, 'low-safe-simulate');
      }
      if (event.opcode === 'notify' && event.channels.includes('email')) {
        outputs.set(`low:${event.tenant}:notify`, 'low-notify-email');
      }
    }

    if (branch === 'medium-path') {
      try {
        if (event.opcode === 'assess' && event.score < 40) {
          outputs.set(`mid:${event.tenant}:assess`, 'medium-assess-watch');
        }
      } catch {
        outputs.set(`mid:${event.tenant}:error`, 'medium-assess-error');
      }
    }

    if (event.opcode === 'archive') {
      outputs.set(`archive:${event.tenant}`, `checksum-${event.checksum}`);
    }
    if (event.opcode === 'report' && event.recipients.length > 2) {
      outputs.set(`report:${event.tenant}`, `recipients-${event.recipients.length}`);
    }
  }

  return outputs;
};

export const seededEvents: readonly RecoveryEvent[] = [
  {
    opcode: 'discover',
    tenant: 'tenant-alpha',
    ts: 1700000000,
    severity: 'critical',
    zone: 'us',
    entity: 'recovery-graph',
  },
  {
    opcode: 'assess',
    tenant: 'tenant-alpha',
    ts: 1700000001,
    severity: 'high',
    score: 91,
    note: 'initial',
  },
  {
    opcode: 'simulate',
    tenant: 'tenant-beta',
    ts: 1700000002,
    severity: 'medium',
    dryRun: true,
    scenario: 'safe-surge',
  },
  {
    opcode: 'rollback',
    tenant: 'tenant-gamma',
    ts: 1700000003,
    severity: 'medium',
    planId: 'rollback-1',
    approvals: ['owner'],
  },
  {
    opcode: 'notify',
    tenant: 'tenant-gamma',
    ts: 1700000004,
    severity: 'low',
    channels: ['pager', 'webhook'],
  },
  {
    opcode: 'archive',
    tenant: 'tenant-gamma',
    ts: 1700000005,
    severity: 'low',
    reason: 'snapshot-expired',
    checksum: 'sha-256-1',
  },
  {
    opcode: 'verify',
    tenant: 'tenant-gamma',
    ts: 1700000006,
    severity: 'medium',
    checks: ['rto', 'latency', 'saturation', 'drift'],
  },
  {
    opcode: 'repair',
    tenant: 'tenant-delta',
    ts: 1700000007,
    severity: 'high',
    strategy: 'reroute',
  },
] as const;

export const seededResolutionMap = runControlGraph(seededEvents);

export const branchSummary = (entries: ReadonlyMap<string, string>): readonly string[] => {
  const out: string[] = [];
  for (const [key, value] of entries) {
    out.push(`${key}=${value}`);
  }
  return out;
};
