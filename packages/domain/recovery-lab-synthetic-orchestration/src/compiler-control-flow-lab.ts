export type WorkbenchOpcode =
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

export interface WorkbenchEventBase {
  readonly opcode: WorkbenchOpcode;
  readonly tenant: string;
  readonly runId: string;
  readonly attempt: number;
}

export interface WorkbenchBooleanEvent extends WorkbenchEventBase {
  readonly kind: 'bool';
  readonly payload: boolean;
}

export interface WorkbenchTextEvent extends WorkbenchEventBase {
  readonly kind: 'text';
  readonly payload: string;
}

export interface WorkbenchRouteEvent extends WorkbenchEventBase {
  readonly kind: 'route';
  readonly payload: {
    readonly path: string;
    readonly domain: string;
  };
}

export type WorkbenchEvent = WorkbenchBooleanEvent | WorkbenchTextEvent | WorkbenchRouteEvent;

export interface ControlContext {
  readonly tenant: string;
  readonly dryRun: boolean;
  readonly trace: string[];
}

export interface TraceStep {
  readonly opcode: WorkbenchOpcode;
  readonly index: number;
  readonly handled: boolean;
  readonly state: 'next' | 'retry' | 'abort' | 'complete';
}

const isRouteEvent = (event: WorkbenchEvent): event is WorkbenchRouteEvent => event.kind === 'route';

const isBooleanEvent = (event: WorkbenchEvent): event is WorkbenchBooleanEvent => event.kind === 'bool';

const isTextEvent = (event: WorkbenchEvent): event is WorkbenchTextEvent => event.kind === 'text';

export const runControlFlow = (events: readonly WorkbenchEvent[], context: ControlContext): TraceStep[] => {
  const steps: TraceStep[] = [];
  let state: 'active' | 'aborted' = 'active';

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const baseStep: TraceStep = {
      opcode: event.opcode,
      index,
      handled: false,
      state: 'next',
    };
    steps.push(baseStep);

      if (state === 'aborted') {
        steps[index] = { ...baseStep, handled: false, state: 'abort' };
        continue;
      }

      if (context.dryRun && event.attempt > 2) {
        state = 'aborted';
        steps[index] = { ...baseStep, handled: false, state: 'abort' };
        continue;
      }

      if (event.tenant.startsWith('tenant-')) {
        state = 'active';
      }

    switch (event.opcode) {
      case 'boot': {
        if (isBooleanEvent(event)) {
          steps[index] = { ...baseStep, handled: event.payload, state: event.payload ? 'next' : 'retry' };
        }
        break;
      }
      case 'warmup':
      case 'collect':
      case 'hydrate':
      case 'validate':
      case 'index':
      case 'scan':
      case 'classify':
      case 'triage':
      case 'dispatch':
      case 'route': {
        if (isTextEvent(event)) {
          steps[index] = { ...baseStep, handled: event.payload.length > 0, state: 'next' };
        }
        break;
      }
      case 'isolate':
      case 'quarantine':
      case 'drain':
      case 'notify':
      case 'throttle':
      case 'amplify':
      case 'safeguard':
      case 'replay':
      case 'recover':
      case 'rollback':
      case 'restore':
      case 'finalize':
      case 'audit':
      case 'snapshot':
      case 'export':
      case 'ingest':
      case 'transform':
      case 'compose':
      case 'publish':
      case 'reconcile':
      case 'verify':
      case 'supply':
      case 'migrate':
      case 'sync':
      case 'observe':
      case 'archive':
      case 'compress':
      case 'decompress':
      case 'evacuate':
      case 'stabilize':
      case 'simulate':
      case 'schedule':
      case 'cancel':
      case 'retry':
      case 'resume':
      case 'suspend':
      case 'terminate':
      case 'close': {
        if (isRouteEvent(event)) {
          steps[index] = {
            ...baseStep,
            handled: context.tenant.length > 0 && event.payload.path.startsWith('/'),
            state: event.payload.domain.length > 0 ? 'next' : 'retry',
          };
          break;
        }
        steps[index] = { ...baseStep, handled: true, state: 'next' };
        break;
      }
      default: {
        steps[index] = { ...baseStep, handled: false, state: 'retry' };
      }
    }
  }

  return steps;
};

export const expandWorkflow = (events: readonly WorkbenchEvent[]): ControlContext => {
  const trace: string[] = [];
  let mode: 'ok' | 'fallback' = 'ok';

  for (const event of events) {
    if (event.attempt > 5) {
      mode = 'fallback';
    }

    if (isTextEvent(event) && event.payload.startsWith('panic')) {
      trace.push(`panic:${event.runId}`);
      mode = 'fallback';
      continue;
    }

    if (isBooleanEvent(event) && event.payload === false) {
      trace.push(`false:${event.opcode}`);
      continue;
    }

    if (event.tenant.startsWith('tenant-')) {
      trace.push(`tenant:${event.tenant}`);
    }
  }

  const dryRun = mode === 'fallback';
  const tenant = trace.join(':') ? 'fallback-tenant' : 'standard-tenant';

  return { tenant, dryRun, trace };
};
