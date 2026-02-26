export type GraphPhase =
  | 'phase_01_boot'
  | 'phase_02_seed'
  | 'phase_03_discover'
  | 'phase_04_map'
  | 'phase_05_validate'
  | 'phase_06_plan'
  | 'phase_07_commit'
  | 'phase_08_enqueue'
  | 'phase_09_schedule'
  | 'phase_10_resolve'
  | 'phase_11_bind'
  | 'phase_12_orchestrate'
  | 'phase_13_simulate'
  | 'phase_14_replay'
  | 'phase_15_repair'
  | 'phase_16_recover'
  | 'phase_17_assess'
  | 'phase_18_analyze'
  | 'phase_19_harden'
  | 'phase_20_reconcile'
  | 'phase_21_repair'
  | 'phase_22_report'
  | 'phase_23_reconcile'
  | 'phase_24_fulfill'
  | 'phase_25_scale'
  | 'phase_26_drain'
  | 'phase_27_prune'
  | 'phase_28_snapshot'
  | 'phase_29_checkpoint'
  | 'phase_30_rebalance'
  | 'phase_31_route'
  | 'phase_32_archive'
  | 'phase_33_cleanup'
  | 'phase_34_alert'
  | 'phase_35_trace'
  | 'phase_36_verify'
  | 'phase_37_promote'
  | 'phase_38_optimize'
  | 'phase_39_sync'
  | 'phase_40_realign'
  | 'phase_41_handoff'
  | 'phase_42_publish'
  | 'phase_43_publish'
  | 'phase_44_archive'
  | 'phase_45_merge'
  | 'phase_46_split'
  | 'phase_47_hibernate'
  | 'phase_48_activate'
  | 'phase_49_finalize'
  | 'phase_50_done';

export type GraphStepResult =
  | {
      readonly accepted: true;
      readonly phase: GraphPhase;
      readonly next?: GraphPhase;
      readonly latencyMs: number;
    }
  | {
      readonly accepted: false;
      readonly phase: GraphPhase;
      readonly reason: string;
      readonly retryAfterMs?: number;
    };

export type BranchContext = {
  readonly tenant: string;
  readonly zone: string;
  readonly severity: 0 | 1 | 2 | 3 | 4 | 5;
  readonly attempt: number;
  readonly budgetMs: number;
};

export type ControlEvent =
  | { readonly kind: 'start'; readonly reason: string }
  | { readonly kind: 'metric'; readonly score: number }
  | { readonly kind: 'error'; readonly code: number; readonly message: string }
  | { readonly kind: 'resume'; readonly reason: string }
  | { readonly kind: 'cancel'; readonly reason: string };

export const executeControlFlow = (context: BranchContext, phase: GraphPhase, event?: ControlEvent): GraphStepResult => {
  const budgetLeft = context.budgetMs - Math.min(context.attempt * 17, context.budgetMs);
  switch (phase) {
    case 'phase_01_boot':
      return { accepted: true, phase, next: 'phase_02_seed', latencyMs: 20 };
    case 'phase_02_seed':
      return context.severity < 3
        ? { accepted: true, phase, next: 'phase_03_discover', latencyMs: 22 }
        : { accepted: false, phase, reason: 'severity too high to seed', retryAfterMs: 1200 };
    case 'phase_03_discover':
      return { accepted: true, phase, next: 'phase_04_map', latencyMs: 23 };
    case 'phase_04_map':
      return { accepted: true, phase, next: 'phase_05_validate', latencyMs: 17 };
    case 'phase_05_validate':
      return event?.kind === 'error'
        ? { accepted: false, phase, reason: event.message, retryAfterMs: 800 }
        : { accepted: true, phase, next: 'phase_06_plan', latencyMs: 18 };
    case 'phase_06_plan':
      return { accepted: true, phase, next: 'phase_07_commit', latencyMs: 19 };
    case 'phase_07_commit':
      return budgetLeft > 1200
        ? { accepted: true, phase, next: 'phase_08_enqueue', latencyMs: 32 }
        : { accepted: false, phase, reason: 'insufficient budget', retryAfterMs: budgetLeft };
    case 'phase_08_enqueue':
      return { accepted: true, phase, next: 'phase_09_schedule', latencyMs: 28 };
    case 'phase_09_schedule':
      return event?.kind === 'cancel'
        ? { accepted: false, phase, reason: event.reason }
        : { accepted: true, phase, next: 'phase_10_resolve', latencyMs: 35 };
    case 'phase_10_resolve':
      return { accepted: true, phase, next: 'phase_11_bind', latencyMs: 40 };
    case 'phase_11_bind':
      return { accepted: true, phase, next: 'phase_12_orchestrate', latencyMs: 12 };
    case 'phase_12_orchestrate':
      return context.attempt % 3 === 0
        ? { accepted: false, phase, reason: 'orchestrator lock contention', retryAfterMs: 450 }
        : { accepted: true, phase, next: 'phase_13_simulate', latencyMs: 16 };
    case 'phase_13_simulate':
      return { accepted: true, phase, next: 'phase_14_replay', latencyMs: 15 };
    case 'phase_14_replay':
      return { accepted: true, phase, next: 'phase_15_repair', latencyMs: 12 };
    case 'phase_15_repair':
      return context.severity > 4
        ? { accepted: false, phase, reason: 'critical severity repair lock', retryAfterMs: 1000 }
        : { accepted: true, phase, next: 'phase_16_recover', latencyMs: 27 };
    case 'phase_16_recover':
      return { accepted: true, phase, next: 'phase_17_assess', latencyMs: 16 };
    case 'phase_17_assess':
      return event?.kind === 'error' && event.code >= 500
        ? { accepted: false, phase, reason: event.message, retryAfterMs: 600 }
        : { accepted: true, phase, next: 'phase_18_analyze', latencyMs: 13 };
    case 'phase_18_analyze':
      return { accepted: true, phase, next: 'phase_19_harden', latencyMs: 13 };
    case 'phase_19_harden':
      return context.severity > 1 ? { accepted: true, phase, next: 'phase_20_reconcile', latencyMs: 21 } : { accepted: true, phase, next: 'phase_20_reconcile', latencyMs: 9 };
    case 'phase_20_reconcile':
      return { accepted: true, phase, next: 'phase_21_repair', latencyMs: 17 };
    case 'phase_21_repair':
      return { accepted: true, phase, next: 'phase_22_report', latencyMs: 14 };
    case 'phase_22_report':
      return event?.kind === 'metric' && event.score < 0.5
        ? { accepted: false, phase, reason: 'quality threshold failed', retryAfterMs: 700 }
        : { accepted: true, phase, next: 'phase_23_reconcile', latencyMs: 17 };
    case 'phase_23_reconcile':
      return { accepted: true, phase, next: 'phase_24_fulfill', latencyMs: 18 };
    case 'phase_24_fulfill':
      return { accepted: true, phase, next: 'phase_25_scale', latencyMs: 16 };
    case 'phase_25_scale':
      return { accepted: true, phase, next: 'phase_26_drain', latencyMs: 19 };
    case 'phase_26_drain':
      return { accepted: true, phase, next: 'phase_27_prune', latencyMs: 12 };
    case 'phase_27_prune':
      return context.attempt > 5
        ? { accepted: false, phase, reason: 'too many attempts', retryAfterMs: 3000 }
        : { accepted: true, phase, next: 'phase_28_snapshot', latencyMs: 11 };
    case 'phase_28_snapshot':
      return { accepted: true, phase, next: 'phase_29_checkpoint', latencyMs: 15 };
    case 'phase_29_checkpoint':
      return { accepted: true, phase, next: 'phase_30_rebalance', latencyMs: 14 };
    case 'phase_30_rebalance':
      return { accepted: true, phase, next: 'phase_31_route', latencyMs: 18 };
    case 'phase_31_route':
      return { accepted: true, phase, next: 'phase_32_archive', latencyMs: 17 };
    case 'phase_32_archive':
      return { accepted: true, phase, next: 'phase_33_cleanup', latencyMs: 8 };
    case 'phase_33_cleanup':
      return { accepted: true, phase, next: 'phase_34_alert', latencyMs: 9 };
    case 'phase_34_alert':
      return { accepted: true, phase, next: 'phase_35_trace', latencyMs: 8 };
    case 'phase_35_trace':
      return { accepted: true, phase, next: 'phase_36_verify', latencyMs: 11 };
    case 'phase_36_verify':
      return event?.kind === 'error'
        ? { accepted: false, phase, reason: event.message, retryAfterMs: 500 }
        : { accepted: true, phase, next: 'phase_37_promote', latencyMs: 11 };
    case 'phase_37_promote':
      return { accepted: true, phase, next: 'phase_38_optimize', latencyMs: 9 };
    case 'phase_38_optimize':
      return { accepted: true, phase, next: 'phase_39_sync', latencyMs: 7 };
    case 'phase_39_sync':
      return { accepted: true, phase, next: 'phase_40_realign', latencyMs: 12 };
    case 'phase_40_realign':
      return { accepted: true, phase, next: 'phase_41_handoff', latencyMs: 6 };
    case 'phase_41_handoff':
      return { accepted: true, phase, next: 'phase_42_publish', latencyMs: 5 };
    case 'phase_42_publish':
    case 'phase_43_publish':
      return { accepted: true, phase, next: 'phase_44_archive', latencyMs: 10 };
    case 'phase_44_archive':
      return { accepted: true, phase, next: 'phase_45_merge', latencyMs: 4 };
    case 'phase_45_merge':
      return { accepted: true, phase, next: 'phase_46_split', latencyMs: 4 };
    case 'phase_46_split':
      return { accepted: true, phase, next: 'phase_47_hibernate', latencyMs: 10 };
    case 'phase_47_hibernate':
      return { accepted: true, phase, next: 'phase_48_activate', latencyMs: 13 };
    case 'phase_48_activate':
      return { accepted: true, phase, next: 'phase_49_finalize', latencyMs: 14 };
    case 'phase_49_finalize':
      return { accepted: true, phase, next: 'phase_50_done', latencyMs: 9 };
    case 'phase_50_done':
      return { accepted: true, phase, latencyMs: 1 };
    default:
      return { accepted: false, phase: 'phase_01_boot', reason: 'unknown phase' };
  }
};

export type BranchResultMap = {
  readonly [K in GraphPhase]: GraphStepResult;
};

export const mapExecution = (context: BranchContext): BranchResultMap => {
  const map = {} as Record<string, GraphStepResult>;
  let current: GraphPhase = 'phase_01_boot';
  const seen = new Set<string>();
  for (let i = 0; i < 100; i += 1) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);
    const eventKind = i % 7 === 0 ? 'error' : i % 5 === 0 ? 'metric' : i % 3 === 0 ? 'cancel' : 'resume';
    const event: ControlEvent =
      eventKind === 'error'
        ? { kind: 'error', code: 500 + (i % 3), message: `error-${i}` }
        : eventKind === 'metric'
          ? { kind: 'metric', score: 0.5 + (i % 4) / 8 }
          : eventKind === 'cancel'
            ? { kind: 'cancel', reason: `cancel-${i}` }
            : { kind: 'resume', reason: `resume-${i}` };

    const result = executeControlFlow(context, current, event);
    map[current] = result;
    if (!result.accepted || result.next === undefined) {
      break;
    }
    current = result.next;
  }
  return map as BranchResultMap;
};

export const runGraph = (tenant: string, zone: string): BranchResultMap => {
  return mapExecution({ tenant, zone, severity: 3, attempt: 1, budgetMs: 10000 });
};

export const collectAccepted = (results: BranchResultMap): readonly GraphPhase[] => {
  const accepted: GraphPhase[] = [];
  for (const phase of Object.keys(results) as GraphPhase[]) {
    const result = results[phase];
    if (result.accepted) {
      accepted.push(result.phase);
    }
  }
  return accepted as readonly GraphPhase[];
};

export const controlFlowNesting = (payload: BranchContext): { readonly path: readonly GraphStepResult[]; readonly accepted: number; readonly rejected: number } => {
  const path: GraphStepResult[] = [];
  const branchMap = mapExecution(payload);
  for (const phase of ['phase_01_boot', 'phase_25_scale', 'phase_50_done'] as const) {
    const found = branchMap[phase];
    if (found) {
      path.push(found);
    }
  }

  let accepted = 0;
  let rejected = 0;
  for (const entry of Object.values(branchMap)) {
    accepted += entry.accepted ? 1 : 0;
    rejected += entry.accepted ? 0 : 1;
  }
  return { path, accepted, rejected };
};
