import {
  buildPlanFromCommands,
  createPlanForWorkspace,
  executePlan,
} from '@domain/recovery-orchestration-lab-models';
import { parseRuntimeId, runtimeId, type RunId } from '@shared/recovery-orchestration-lab-runtime';

const sample = buildPlanFromCommands;

export interface EngineInput {
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly commands: readonly string[];
}

export interface EngineReport {
  readonly runId: RunId;
  readonly score: number;
  readonly outputCount: number;
  readonly warnings: readonly string[];
  readonly summary: string;
}

export const runEngine = async (input: EngineInput): Promise<EngineReport> => {
  const runId = parseRuntimeId('run', runtimeId.run(input.tenant, `${input.scenario}:${Date.now()}`));
  const plan = await createPlanForWorkspace({
    tenant: input.tenant,
    workspace: input.workspace,
    scenario: input.scenario,
    commands: [...input.commands],
  });

  const execution = await executePlan({
    workspace: `ws:${input.workspace}` as never,
    runId,
    plugins: [],
  } as never);

  return {
    runId,
    score: plan.score + execution.score,
    outputCount: execution.outputCount,
    warnings: execution.ok ? plan.warnings : [...plan.warnings, execution.summary],
    summary: execution.ok ? 'completed' : 'errored',
  };
};

const createStackDisposer = (): { [Symbol.asyncDispose]: () => PromiseLike<void> } => {
  const Ctor = (globalThis as { AsyncDisposableStack?: new () => unknown }).AsyncDisposableStack;
  if (!Ctor) {
    return { [Symbol.asyncDispose]: async () => undefined };
  }

  const live = new Ctor();
  return {
    [Symbol.asyncDispose]: async () => {
      const disposeAsync = (live as { disposeAsync?: () => PromiseLike<void> }).disposeAsync;
      if (typeof disposeAsync === 'function') {
        await disposeAsync.call(live);
        return;
      }

      const asyncDispose = (live as { [Symbol.asyncDispose]?: () => PromiseLike<void> })?.[Symbol.asyncDispose];
      if (typeof asyncDispose === 'function') {
        await asyncDispose.call(live);
        return;
      }

      const dispose = (live as { dispose?: () => void }).dispose;
      if (typeof dispose === 'function') {
        dispose.call(live);
      }
    },
  };
};

export const createEngine = async () => {
  const stack = createStackDisposer();
  try {
    await using _scope = stack;
    return {
      ready: true,
      build: async (input: EngineInput): Promise<EngineReport> => runEngine(input),
    };
  } finally {
    await stack[Symbol.asyncDispose]();
  }
};

export const estimateThroughput = (samples: readonly number[]): string => {
  const total = samples.reduce((acc, value) => acc + value, 0);
  if (samples.length === 0) {
    return '0/s';
  }
  return `${(total / samples.length).toFixed(2)}/s`;
};
