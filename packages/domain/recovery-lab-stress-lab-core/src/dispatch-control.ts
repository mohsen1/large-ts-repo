import type { SolverOutput } from '@shared/type-level';
import type { StressCommand, StressDomain, StressSeverity, StressVerb, SolverInput } from '@shared/type-level';

type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export type DispatchSignalCode =
  | 'ev-000'
  | 'ev-001'
  | 'ev-002'
  | 'ev-003'
  | 'ev-004'
  | 'ev-005'
  | 'ev-006'
  | 'ev-007'
  | 'ev-008'
  | 'ev-009'
  | 'ev-010'
  | 'ev-011'
  | 'ev-012'
  | 'ev-013'
  | 'ev-014'
  | 'ev-015'
  | 'ev-016'
  | 'ev-017'
  | 'ev-018'
  | 'ev-019'
  | 'ev-020'
  | 'ev-021'
  | 'ev-022'
  | 'ev-023'
  | 'ev-024'
  | 'ev-025'
  | 'ev-026'
  | 'ev-027'
  | 'ev-028'
  | 'ev-029'
  | 'ev-030'
  | 'ev-031'
  | 'ev-032'
  | 'ev-033'
  | 'ev-034'
  | 'ev-035'
  | 'ev-036'
  | 'ev-037'
  | 'ev-038'
  | 'ev-039'
  | 'ev-040'
  | 'ev-041'
  | 'ev-042'
  | 'ev-043'
  | 'ev-044'
  | 'ev-045'
  | 'ev-046'
  | 'ev-047'
  | 'ev-048'
  | 'ev-049'
  | 'ev-050';

type DispatchTransitionMap = Record<DispatchSignalCode, DispatchSignalCode[]>;

export interface DispatchContext {
  readonly tenant: string;
  readonly phase: 'start' | 'step' | 'finish' | 'rollback' | 'failover';
  readonly command: StressCommand;
  readonly routeHints: readonly string[];
}

export interface DispatchReport {
  readonly accepted: boolean;
  readonly status: 'ignored' | 'queued' | 'executed' | 'suppressed' | 'failed' | 'retry' | 'rollback';
  readonly code: DispatchSignalCode;
  readonly next: DispatchSignalCode[];
  readonly notes: readonly string[];
}

const dispatchMatrix: DispatchTransitionMap = {
  'ev-000': ['ev-001'],
  'ev-001': ['ev-002', 'ev-003'],
  'ev-002': ['ev-004'],
  'ev-003': ['ev-005'],
  'ev-004': ['ev-006', 'ev-007'],
  'ev-005': ['ev-008'],
  'ev-006': ['ev-009'],
  'ev-007': ['ev-010', 'ev-011'],
  'ev-008': ['ev-012'],
  'ev-009': ['ev-013'],
  'ev-010': ['ev-014'],
  'ev-011': ['ev-015'],
  'ev-012': ['ev-016', 'ev-017'],
  'ev-013': ['ev-018'],
  'ev-014': ['ev-019'],
  'ev-015': ['ev-020'],
  'ev-016': ['ev-021'],
  'ev-017': ['ev-022'],
  'ev-018': ['ev-023'],
  'ev-019': ['ev-024'],
  'ev-020': ['ev-025'],
  'ev-021': ['ev-026'],
  'ev-022': ['ev-027'],
  'ev-023': ['ev-028'],
  'ev-024': ['ev-029'],
  'ev-025': ['ev-030'],
  'ev-026': ['ev-031'],
  'ev-027': ['ev-032'],
  'ev-028': ['ev-033'],
  'ev-029': ['ev-034'],
  'ev-030': ['ev-035'],
  'ev-031': ['ev-036'],
  'ev-032': ['ev-037'],
  'ev-033': ['ev-038'],
  'ev-034': ['ev-039'],
  'ev-035': ['ev-040'],
  'ev-036': ['ev-041'],
  'ev-037': ['ev-042'],
  'ev-038': ['ev-043'],
  'ev-039': ['ev-044'],
  'ev-040': ['ev-045'],
  'ev-041': ['ev-046'],
  'ev-042': ['ev-047'],
  'ev-043': ['ev-048'],
  'ev-044': ['ev-049'],
  'ev-045': ['ev-050'],
  'ev-046': ['ev-047'],
  'ev-047': ['ev-048'],
  'ev-048': ['ev-049'],
  'ev-049': ['ev-050'],
  'ev-050': [],
};

export const dispatchReportDefaults: Readonly<Record<DispatchSignalCode, DispatchReport>> = {
  'ev-000': { accepted: true, status: 'queued', code: 'ev-000', next: dispatchMatrix['ev-000'], notes: ['start'] },
  'ev-001': { accepted: true, status: 'queued', code: 'ev-001', next: dispatchMatrix['ev-001'], notes: ['discover'] },
  'ev-002': { accepted: true, status: 'queued', code: 'ev-002', next: dispatchMatrix['ev-002'], notes: ['ingest'] },
  'ev-003': { accepted: true, status: 'queued', code: 'ev-003', next: dispatchMatrix['ev-003'], notes: ['materialize'] },
  'ev-004': { accepted: true, status: 'queued', code: 'ev-004', next: dispatchMatrix['ev-004'], notes: ['validate'] },
  'ev-005': { accepted: true, status: 'queued', code: 'ev-005', next: dispatchMatrix['ev-005'], notes: ['reconcile'] },
  'ev-006': { accepted: true, status: 'queued', code: 'ev-006', next: dispatchMatrix['ev-006'], notes: ['synthesize'] },
  'ev-007': { accepted: true, status: 'queued', code: 'ev-007', next: dispatchMatrix['ev-007'], notes: ['snapshot'] },
  'ev-008': { accepted: true, status: 'queued', code: 'ev-008', next: dispatchMatrix['ev-008'], notes: ['restore'] },
  'ev-009': { accepted: true, status: 'queued', code: 'ev-009', next: dispatchMatrix['ev-009'], notes: ['simulate'] },
  'ev-010': { accepted: true, status: 'queued', code: 'ev-010', next: dispatchMatrix['ev-010'], notes: ['inject'] },
  'ev-011': { accepted: true, status: 'queued', code: 'ev-011', next: dispatchMatrix['ev-011'], notes: ['amplify'] },
  'ev-012': { accepted: true, status: 'queued', code: 'ev-012', next: dispatchMatrix['ev-012'], notes: ['throttle'] },
  'ev-013': { accepted: true, status: 'queued', code: 'ev-013', next: dispatchMatrix['ev-013'], notes: ['rebalance'] },
  'ev-014': { accepted: true, status: 'queued', code: 'ev-014', next: dispatchMatrix['ev-014'], notes: ['reroute'] },
  'ev-015': { accepted: true, status: 'queued', code: 'ev-015', next: dispatchMatrix['ev-015'], notes: ['contain'] },
  'ev-016': { accepted: true, status: 'queued', code: 'ev-016', next: dispatchMatrix['ev-016'], notes: ['recover'] },
  'ev-017': { accepted: true, status: 'queued', code: 'ev-017', next: dispatchMatrix['ev-017'], notes: ['observe'] },
  'ev-018': { accepted: true, status: 'queued', code: 'ev-018', next: dispatchMatrix['ev-018'], notes: ['drill'] },
  'ev-019': { accepted: true, status: 'queued', code: 'ev-019', next: dispatchMatrix['ev-019'], notes: ['audit'] },
  'ev-020': { accepted: true, status: 'queued', code: 'ev-020', next: dispatchMatrix['ev-020'], notes: ['telemetry'] },
  'ev-021': { accepted: true, status: 'queued', code: 'ev-021', next: dispatchMatrix['ev-021'], notes: ['dispatch'] },
  'ev-022': { accepted: true, status: 'queued', code: 'ev-022', next: dispatchMatrix['ev-022'], notes: ['fallback'] },
  'ev-023': { accepted: true, status: 'queued', code: 'ev-023', next: dispatchMatrix['ev-023'], notes: ['fallback'] },
  'ev-024': { accepted: true, status: 'queued', code: 'ev-024', next: dispatchMatrix['ev-024'], notes: ['fallback'] },
  'ev-025': { accepted: true, status: 'queued', code: 'ev-025', next: dispatchMatrix['ev-025'], notes: ['fallback'] },
  'ev-026': { accepted: true, status: 'queued', code: 'ev-026', next: dispatchMatrix['ev-026'], notes: ['fallback'] },
  'ev-027': { accepted: true, status: 'queued', code: 'ev-027', next: dispatchMatrix['ev-027'], notes: ['fallback'] },
  'ev-028': { accepted: true, status: 'queued', code: 'ev-028', next: dispatchMatrix['ev-028'], notes: ['fallback'] },
  'ev-029': { accepted: true, status: 'queued', code: 'ev-029', next: dispatchMatrix['ev-029'], notes: ['fallback'] },
  'ev-030': { accepted: true, status: 'queued', code: 'ev-030', next: dispatchMatrix['ev-030'], notes: ['fallback'] },
  'ev-031': { accepted: true, status: 'queued', code: 'ev-031', next: dispatchMatrix['ev-031'], notes: ['fallback'] },
  'ev-032': { accepted: true, status: 'queued', code: 'ev-032', next: dispatchMatrix['ev-032'], notes: ['fallback'] },
  'ev-033': { accepted: true, status: 'queued', code: 'ev-033', next: dispatchMatrix['ev-033'], notes: ['fallback'] },
  'ev-034': { accepted: true, status: 'queued', code: 'ev-034', next: dispatchMatrix['ev-034'], notes: ['fallback'] },
  'ev-035': { accepted: true, status: 'queued', code: 'ev-035', next: dispatchMatrix['ev-035'], notes: ['fallback'] },
  'ev-036': { accepted: true, status: 'queued', code: 'ev-036', next: dispatchMatrix['ev-036'], notes: ['fallback'] },
  'ev-037': { accepted: true, status: 'queued', code: 'ev-037', next: dispatchMatrix['ev-037'], notes: ['fallback'] },
  'ev-038': { accepted: true, status: 'queued', code: 'ev-038', next: dispatchMatrix['ev-038'], notes: ['fallback'] },
  'ev-039': { accepted: true, status: 'queued', code: 'ev-039', next: dispatchMatrix['ev-039'], notes: ['fallback'] },
  'ev-040': { accepted: true, status: 'queued', code: 'ev-040', next: dispatchMatrix['ev-040'], notes: ['fallback'] },
  'ev-041': { accepted: true, status: 'queued', code: 'ev-041', next: dispatchMatrix['ev-041'], notes: ['fallback'] },
  'ev-042': { accepted: true, status: 'queued', code: 'ev-042', next: dispatchMatrix['ev-042'], notes: ['fallback'] },
  'ev-043': { accepted: true, status: 'queued', code: 'ev-043', next: dispatchMatrix['ev-043'], notes: ['fallback'] },
  'ev-044': { accepted: true, status: 'queued', code: 'ev-044', next: dispatchMatrix['ev-044'], notes: ['fallback'] },
  'ev-045': { accepted: true, status: 'queued', code: 'ev-045', next: dispatchMatrix['ev-045'], notes: ['fallback'] },
  'ev-046': { accepted: true, status: 'queued', code: 'ev-046', next: dispatchMatrix['ev-046'], notes: ['fallback'] },
  'ev-047': { accepted: true, status: 'queued', code: 'ev-047', next: dispatchMatrix['ev-047'], notes: ['fallback'] },
  'ev-048': { accepted: true, status: 'queued', code: 'ev-048', next: dispatchMatrix['ev-048'], notes: ['fallback'] },
  'ev-049': { accepted: true, status: 'queued', code: 'ev-049', next: dispatchMatrix['ev-049'], notes: ['fallback'] },
  'ev-050': { accepted: true, status: 'retry', code: 'ev-050', next: dispatchMatrix['ev-050'], notes: ['complete'] },
};

export type SolverInputState = { verb: StressVerb; domain: StressDomain; severity: StressSeverity };

export const classifyDispatch = (signal: DispatchSignalCode, context: DispatchContext): SolverInputState => {
  const isTerminal = signal >= 'ev-045';
  if (isTerminal) {
    return {
      verb: 'dispatch',
      domain: 'workload',
      severity: 'critical',
    };
  }
  if (signal < 'ev-010') {
    return {
      verb: 'discover',
      domain: 'node',
      severity: 'low',
    };
  }
  if (signal < 'ev-020') {
    return {
      verb: 'ingest',
      domain: 'cluster',
      severity: 'medium',
    };
  }
  if (signal === 'ev-020' || signal === 'ev-021') {
    return {
      verb: 'reconcile',
      domain: 'registry',
      severity: 'high',
    };
  }
  if (signal === 'ev-022' || signal === 'ev-023') {
    return {
      verb: 'recover',
      domain: 'policy',
      severity: 'critical',
    };
  }
  if (signal === 'ev-024' || signal === 'ev-025' || signal === 'ev-026') {
    return {
      verb: 'observe',
      domain: 'telemetry',
      severity: 'info',
    };
  }
  if (signal === 'ev-027' || signal === 'ev-028' || signal === 'ev-029') {
    return {
      verb: 'simulate',
      domain: 'planner',
      severity: 'emergency',
    };
  }
  return {
    verb: 'audit',
    domain: 'store',
    severity: 'low',
  };
};

export const expandDispatch = (signal: DispatchSignalCode): DispatchSignalCode[] => {
  const out: DispatchSignalCode[] = [];
  const seen = new Set<string>();
  const stack: DispatchSignalCode[] = [signal];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current) {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    out.push(current);
    const next = dispatchMatrix[current] ?? [];
    for (const edge of next) {
      stack.push(edge);
    }
  }
  return out;
};

const inferStatus = (signal: DispatchSignalCode, context: DispatchContext): DispatchReport['status'] => {
  if (context.phase === 'rollback') {
    return 'rollback';
  }
  if (context.phase === 'failover') {
    return 'failed';
  }
  if (signal === 'ev-050') {
    return 'executed';
  }
  if (context.phase === 'start' && signal === 'ev-000') {
    return 'queued';
  }
  if (context.phase === 'finish') {
    return 'retry';
  }
  if (context.phase === 'step' && signal < 'ev-030') {
    return 'suppressed';
  }
  return 'ignored';
};

export function evaluateDispatch(signal: DispatchSignalCode, context: DispatchContext): DispatchReport {
  const next = expandDispatch(signal);
  const branch = classifyDispatch(signal, context);
  const warnings: string[] = [];
  const status = inferStatus(signal, context);
  const command = `${branch.verb}:${branch.domain}:${branch.severity}` as StressCommand;

  if (context.routeHints.length > 5) {
    warnings.push('many-routes');
  }
  if (context.phase === 'step') {
    warnings.push('step-phase');
  }
  if (signal > 'ev-040') {
    warnings.push('late-stage');
  }

  return {
    accepted: status !== 'failed',
    status,
    code: signal,
    next,
    notes: warnings,
  };
}

export const dispatchWorkflow = (
  signal: DispatchSignalCode,
  context: DispatchContext,
): Result<DispatchReport, Error> => {
  try {
    if (context.routeHints.length === 0) {
      return { ok: false, error: new Error('no-route-hint') };
    }
    const output = evaluateDispatch(signal, {
      ...context,
      routeHints: [...context.routeHints, context.command],
    });
    return { ok: true, value: output };
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, error };
    }
    return { ok: false, error: new Error('dispatch-failure') };
  }
};

export const expandDispatchPlan = async <TInput extends SolverInput>(input: TInput): Promise<SolverOutput<TInput>> => {
  const traces: string[] = [];
  const commands = dispatchReportDefaults['ev-000'];
  for (const branch of commands.next) {
    const branchContext: DispatchContext = {
      tenant: 'tenant-a',
      phase: 'step',
      command: input.command,
      routeHints: ['start', branch],
    };
    const report = evaluateDispatch(branch, branchContext);
    traces.push(report.code);
  }
  const output: SolverOutput<TInput> = {
    input,
    ok: traces.length > 0,
    warnings: traces,
    profile: {
      source: 'dispatch-plan',
      route: traces.join(','),
      phase: input.stage,
    },
  };
  return output;
};

export const dispatchFlow = (inputs: readonly DispatchSignalCode[]): ReadonlyMap<DispatchSignalCode, DispatchReport> => {
  const out = new Map<DispatchSignalCode, DispatchReport>();
  for (const input of inputs) {
    const report = evaluateDispatch(input, {
      tenant: 'tenant-a',
      phase: 'start',
      command: 'discover:workload:low',
      routeHints: ['startup'],
    });
    out.set(input, report);
  }
  return out;
};

export function dispatchOverloads(signal: 'ev-000'): 'cold';
export function dispatchOverloads(signal: 'ev-050'): 'hot';
export function dispatchOverloads(signal: DispatchSignalCode): 'cold' | 'hot';
export function dispatchOverloads(signal: DispatchSignalCode): 'cold' | 'hot' {
  return signal === 'ev-050' ? 'hot' : 'cold';
}
