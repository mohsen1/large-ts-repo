import { type WorkbenchEvent, type WorkbenchOpcode, type WorkbenchEventBase, runControlFlow, type TraceStep } from './compiler-control-flow-lab';
import { parseRoute, routeKinds } from '@shared/type-level/stress-conditional-depth-grid';

type BranchOpcode =
  | 'boot'
  | 'warmup'
  | 'collect'
  | 'hydrate'
  | 'validate'
  | 'index'
  | 'scan'
  | 'classify'
  | 'triage'
  | 'dispatch'
  | 'route'
  | 'isolate'
  | 'quarantine'
  | 'drain'
  | 'notify'
  | 'throttle'
  | 'amplify'
  | 'safeguard'
  | 'replay'
  | 'recover'
  | 'rollback'
  | 'restore'
  | 'finalize'
  | 'audit'
  | 'snapshot'
  | 'export'
  | 'ingest'
  | 'transform'
  | 'compose'
  | 'publish'
  | 'reconcile'
  | 'verify'
  | 'supply'
  | 'migrate'
  | 'sync'
  | 'observe'
  | 'archive'
  | 'compress'
  | 'decompress'
  | 'evacuate'
  | 'stabilize'
  | 'simulate'
  | 'schedule'
  | 'cancel'
  | 'retry'
  | 'resume'
  | 'suspend'
  | 'terminate'
  | 'close';

type BranchStepKind = 'hot' | 'cold' | 'mixed';

interface ControlTrace {
  readonly opcode: BranchOpcode;
  readonly phase: 'enter' | 'exit' | 'retry';
  readonly weight: number;
  readonly branch: BranchStepKind;
  readonly route: string;
  readonly raw?: string;
}

export interface BranchDecisionInput {
  readonly tenant: string;
  readonly routes: readonly string[];
  readonly mode: 'sim' | 'dry-run' | 'execute';
  readonly attempt: number;
}

export interface BranchDecisionContext extends BranchDecisionInput, WorkbenchEventBase {
  readonly route: string;
  readonly phase: 'start' | 'mid' | 'done';
}

export interface BranchDecisionResult {
  readonly tenant: string;
  readonly accepted: readonly ControlTrace[];
  readonly blocked: readonly string[];
  readonly reroute: readonly string[];
  readonly finalState: 'ok' | 'fallback' | 'abort';
}

const resolveRoute = (route: string): string => {
  const preview = parseRoute(route);
  return `${preview.namespace}/${preview.entity}`;
};

const shouldBlock = (opcode: BranchOpcode, mode: BranchDecisionInput['mode'], attempt: number): boolean => {
  if (mode === 'execute') {
    return false;
  }
  return (opcode.length + attempt) % 3 === 0;
};

const branchKind = (opcode: BranchOpcode, traceLen: number): BranchStepKind => {
  if (opcode === 'terminate' || opcode === 'suspend' || opcode === 'close') {
    return 'hot';
  }
  if (opcode === 'boot' || traceLen % 2 === 0) {
    return 'cold';
  }
  return 'mixed';
};

const branchFlow: BranchOpcode[] = [
  'boot',
  'warmup',
  'collect',
  'hydrate',
  'validate',
  'index',
  'scan',
  'classify',
  'triage',
  'dispatch',
  'route',
  'isolate',
  'quarantine',
  'drain',
  'notify',
  'throttle',
  'amplify',
  'safeguard',
  'replay',
  'recover',
  'rollback',
  'restore',
  'finalize',
  'audit',
  'snapshot',
  'export',
  'ingest',
  'transform',
  'compose',
  'publish',
  'reconcile',
  'verify',
  'supply',
  'migrate',
  'sync',
  'observe',
  'archive',
  'compress',
  'decompress',
  'evacuate',
  'stabilize',
  'simulate',
  'schedule',
  'cancel',
  'retry',
  'resume',
  'suspend',
  'terminate',
  'close',
];

const buildTrace = (
  opcode: BranchOpcode,
  attempt: number,
  mode: BranchDecisionInput['mode'],
  route: string,
): ControlTrace => {
  const domainHints = [...routeKinds.keys()];
  const normalized = (domainHints.includes(route) || domainHints.includes(route.split('/')[0] as string)) ? opcode : 'boot';
  return {
    opcode: normalized,
    phase: mode === 'execute' ? 'enter' : attempt > 2 ? 'retry' : 'exit',
    weight: attempt + opcode.length,
    route,
    raw: mode,
    branch: mode === 'execute' ? 'hot' : attempt % 3 === 0 ? 'mixed' : branchKind(opcode, attempt),
  };
};

const eventToBranchOpcodes = (event: WorkbenchEvent): BranchOpcode[] => {
  if (event.kind === 'route') {
    return ['route', 'notify', 'simulate', 'finalize'];
  }
  return ['collect', 'verify', 'recover', event.opcode];
};

export const buildBranchDecision = (events: readonly WorkbenchOpcode[], context: BranchDecisionInput): BranchDecisionResult => {
  const accepted: ControlTrace[] = [];
  const blocked: string[] = [];
  const reroute: string[] = [];
  let finalState: BranchDecisionResult['finalState'] = 'ok';

  const branchEvents = events.flatMap((event) => eventToBranchOpcodes({ kind: 'bool', runId: 'seed', tenant: 't', attempt: 0, opcode: event, payload: false } as any));

  for (let outer = 0; outer < branchEvents.length; outer += 1) {
    const opcode = branchEvents[outer] as BranchOpcode;
    const routeCandidate = resolveRoute(context.routes[outer % context.routes.length] ?? '/fallback/route/path');
    const trace = buildTrace(opcode, context.attempt + outer, context.mode, routeCandidate);
    const isBlocked = shouldBlock(opcode, context.mode, outer);

    const isCritical = ['terminate', 'rollback', 'isolate', 'quarantine', 'drain'].includes(opcode);

    if (isBlocked) {
      blocked.push(`${opcode}:${routeCandidate}`);
      finalState = 'fallback';
      if (outer % 4 === 0) {
        reroute.push(routeCandidate);
      }
      continue;
    }

    if (opcode === 'simulate' || opcode === 'recover' || opcode === 'restore' || isCritical) {
      accepted.push({ ...trace, branch: branchKind(opcode, accepted.length) });
      if (context.mode === 'execute' && trace.weight > 25) {
        finalState = 'fallback';
      }
      continue;
    }

    if ((opcode as string) === 'compact') {
      accepted.push({ ...trace, branch: 'cold', raw: 'compacted' });
      continue;
    }

    if (opcode === 'snapshot' || opcode === 'export') {
      if (context.mode === 'dry-run') {
        blocked.push(`${opcode}:snapshot-dry`);
        finalState = 'fallback';
      } else {
        accepted.push({ ...trace, branch: 'mixed', raw: 'snapshot-ready' });
      }
      continue;
    }

    if (opcode === 'drain' || opcode === 'evacuate') {
      reroute.push(routeCandidate);
      accepted.push({ ...trace, branch: 'hot' });
      continue;
    }

    if (opcode === 'verify' || opcode === 'audit' || opcode === 'reconcile') {
      if (context.attempt > 3) {
        blocked.push(`${opcode}:late-attempt`);
        finalState = 'abort';
      } else {
        accepted.push({ ...trace, raw: 'validated' });
      }
      continue;
    }

    if (opcode === 'notify' || opcode === 'publish' || opcode === 'observe') {
      accepted.push({ ...trace, branch: 'mixed' });
      continue;
    }

    if (opcode === 'terminate') {
      finalState = 'abort';
      blocked.push(`${opcode}:forbidden`);
      continue;
    }

    accepted.push(trace);
    if (outer === branchEvents.length - 1 && finalState === 'ok') {
      finalState = context.mode === 'execute' ? 'ok' : 'fallback';
    }
  }

  return {
    tenant: context.tenant,
    accepted,
    blocked,
    reroute,
    finalState,
  };
};

export const runBranchControlFlow = (input: BranchDecisionInput, events: readonly WorkbenchEvent[]): BranchDecisionResult[] => {
  const grouped = new Map<string, BranchDecisionResult>();

  for (const event of events) {
    const seed = event.runId as string;
    const derived: BranchDecisionInput = {
      tenant: input.tenant,
      routes: input.routes,
      mode: input.mode,
      attempt: input.attempt + event.attempt,
    };

    const decisionInput: BranchDecisionInput = {
      tenant: seed ? `${input.tenant}-${seed}` : input.tenant,
      routes: input.routes,
      mode: derived.mode,
      attempt: derived.attempt,
    };

    const opcodes = [
      ...branchFlow,
      ...(event.kind === 'route' ? ['notify', 'simulate', 'finalize'] : ['collect', 'verify']),
      event.opcode,
    ] as BranchOpcode[];
    const decision = buildBranchDecision(opcodes, decisionInput);
    grouped.set(seed, decision);
  }

  return [...grouped.values()];
};

const buildTraceSteps = (events: readonly WorkbenchEvent[]): readonly TraceStep[] => {
  const resolved = runControlFlow(events, {
    tenant: 'stress-tenant',
    dryRun: events.length % 2 === 0,
    trace: [],
  });
  return resolved;
};

export const controlFlowHarness = (input: BranchDecisionInput, events: readonly WorkbenchEvent[]) => {
  const decisions = runBranchControlFlow(input, events);
  const traceSteps = buildTraceSteps(events);
  const decisionMap = new Map<string, BranchDecisionResult['finalState']>();
  for (const decision of decisions) {
    decisionMap.set(decision.tenant, decision.finalState);
  }

  return {
    decisions,
    traceSteps,
    decisionMap,
    totalAccepted: decisions.reduce((acc, decision) => acc + decision.accepted.length, 0),
    totalBlocked: decisions.reduce((acc, decision) => acc + decision.blocked.length, 0),
    totalReroute: decisions.reduce((acc, decision) => acc + decision.reroute.length, 0),
  };
};
