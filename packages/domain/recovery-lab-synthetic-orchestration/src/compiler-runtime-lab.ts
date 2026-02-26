import { NoInfer, type Brand } from '@shared/type-level';
import { stressTsStressHarness } from '@shared/type-level';
import { resolvePayload, type ResolverOutput } from './compiler-generic-lab';
import {
  runControlFlow,
  type WorkbenchEvent,
  type TraceStep,
  type WorkbenchOpcode,
} from './compiler-control-flow-lab';

export type RuntimeSessionId = Brand<string, 'RuntimeSessionId'>;
export type RuntimeMetric = { readonly key: string; readonly value: number };

type StressRoute = `${string}:${string}:${string}`;

type RuntimeStackFrame = {
  readonly id: RuntimeSessionId;
  readonly startedAt: number;
  readonly metrics: RuntimeMetric[];
};

class RuntimeFrame implements Disposable, AsyncDisposable {
  private readonly frames: RuntimeStackFrame[] = [];
  private disposed = false;

  constructor(public readonly id: RuntimeSessionId) {}

  push(metric: RuntimeMetric): void {
    this.frames.push({ id: this.id, startedAt: metric.value, metrics: [metric] });
  }

  [Symbol.dispose](): void {
    this.disposed = true;
    this.frames.length = 0;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.disposed = true;
    this.frames.splice(0);
    await Promise.resolve();
  }
}

const bootstrap = {
  startedAt: Date.now(),
  tenant: 'tenant-bootstrap',
  routes: ['discover:incident:critical'],
};

export const buildBootFrame = (id: RuntimeSessionId): RuntimeFrame => new RuntimeFrame(id);

export const runRuntimeBench = (
  events: readonly WorkbenchEvent[],
  opcode: NoInfer<WorkbenchOpcode>,
): {
  readonly session: RuntimeSessionId;
  readonly steps: readonly TraceStep[];
  readonly resolved: readonly ResolverOutput<string, { tag: 'runtime' }>[];
} => {
  const session = `${opcode}-${bootstrap.tenant}-${bootstrap.startedAt}` as RuntimeSessionId;
  const frame = buildBootFrame(session);

  using _frame = frame;

  const context = {
    tenant: session,
    dryRun: opcode.length < 6,
    trace: ['runtime-start'],
  };

  const steps = runControlFlow(events, context);
  const resolved: ResolverOutput<string, { tag: 'runtime' }>[] = [];

  for (const step of steps) {
    frame.push({ key: step.opcode, value: step.handled ? 1 : 0 });
    resolved.push(resolvePayload(step.state, 'runtime'));
  }

  return {
    session,
    steps,
    resolved,
  };
};

export const runScopedSession = async (events: readonly WorkbenchEvent[]): Promise<number> => {
  const id = `session-${Date.now()}` as RuntimeSessionId;
  const frame = buildBootFrame(id);
  using _ = frame;

  const output: StressRoute[] = [];
  for (const key of Object.keys(stressTsStressHarness.routeCatalog)) {
    if (key.startsWith('i')) {
      output.push(`${events[0]?.opcode ?? 'boot'}:${key}:critical`);
    }
  }

  return output.length;
};
