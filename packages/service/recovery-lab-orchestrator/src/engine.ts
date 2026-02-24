import { createRegistry, asTraceId, type PluginContext } from '@shared/recovery-lab-kernel';
import { executePipeline } from '@shared/recovery-lab-kernel';
import type { NoInfer } from '@shared/type-level';
import { WorkflowAssembler } from '@domain/recovery-simulation-lab-core';
import {
  buildExecution,
  type LabExecution,
  type LabExecutionContext,
  type LabExecutionResult,
  type LabPlanTemplate,
  type LabScenario,
} from '@domain/recovery-simulation-lab-core';
import type { RecoveryLabStore } from '@data/recovery-lab-simulation-store';
import { summarizeResult } from '@data/recovery-lab-simulation-store';

interface ActiveRun {
  execution: LabExecution;
  scenario: LabScenario;
  plan: LabPlanTemplate | null;
}

export class RecoveryLabRuntime {
  readonly #store: RecoveryLabStore;
  readonly #observed = new Map<string, number>();

  public constructor(
    store: RecoveryLabStore,
    private readonly observers: Array<(event: string, payload: Record<string, unknown>) => void> = [],
  ) {
    this.#store = store;
  }

  public async bootstrap(tenant: string, scenario: LabScenario, plan: LabPlanTemplate | null): Promise<ActiveRun> {
    const execution = buildExecution(tenant, scenario.scenarioId, scenario.lane);
    await this.#store.scenarios.saveScenario(scenario);
    if (plan) {
      await this.#store.plans.savePlan(plan);
    }

    this.notify('bootstrap', {
      tenant,
      scenarioId: scenario.scenarioId,
      plan: plan?.scenarioId ?? 'none',
    });
    return { execution, scenario, plan };
  }

  public async run(tenant: string, scenarioId: string, lane: string): Promise<LabExecutionResult> {
    const scenario = await this.#store.scenarios.loadScenario(tenant, scenarioId);
    if (!scenario) {
      throw new Error(`Unknown scenario ${tenant}:${scenarioId}`);
    }

    const plans = await this.#store.plans.listPlans(tenant);
    const chosen = plans.find((plan) => plan.scenarioId === scenarioId) ?? null;

    const workflow = new WorkflowAssembler({
      tenant: scenario.tenant,
      scenarios: [scenario],
      plans: chosen ? [chosen] : [],
    }, lane === 'simulate' ? 'adaptive' : 'strict');

    const execution = buildExecution(tenant, scenarioId, scenario.lane);
    await this.#store.runs.appendRun(execution);

    const context: LabExecutionContext = {
      tenant: scenario.tenant,
      traceId: asTraceId(`${tenant}-${scenarioId}-trace`),
      runId: execution.executionId,
      initiatedBy: 'lab-operator',
      startedAt: Date.now(),
      workspace: 'default',
    };

    const steps = workflow.expandScenario(scenario);

    const registry = createRegistry({
      tenant,
      traceId: asTraceId(`${tenant}-${scenarioId}`),
      correlationKey: `${tenant}:${scenarioId}`,
      startedAt: Date.now(),
      metadata: {
        lane: scenario.lane,
        workspace: 'default',
      },
    });

    const runResult =
      (await Promise.all([
        executePipeline(
          context,
          (ctx) => {
            this.notify('prepare', { tenant, stage: 'prepare', runAt: ctx.startedAt });
            return { ...ctx, prepared: true } as unknown as LabExecutionContext;
          },
          (ctx) => {
            this.notify('prepare', { tenant, stage: 'execute', payload: steps.join('|') });
            return { ...ctx, executed: true } as unknown as LabExecutionContext;
          },
        ),
        (async () => {
          await using _scope = new AsyncDisposableStack();
          _scope.use(registry);
        })(),
      ]))[0];

    const started = Date.now();
    const output: LabExecutionResult = {
      context: {
        ...context,
        workspace: `${context.workspace}:${routeKey(steps)}`,
      },
      execution,
      steps: [
        {
          message: 'execution prepared',
          status: 'ok',
          score: 1,
          signalDelta: steps.length,
        },
      ],
      health: 0.93,
      status: 'passed',
      telemetry: {
        runId: execution.executionId,
        tenant,
        events: runResult.touched,
        metrics: {
          stageCount: runResult.touched,
          outputLength: runResult.output ? 1 : 0,
          elapsedMs: runResult.elapsedMs,
        },
        emitted: [runResult.output ? 'run' : 'none'],
      },
    };

    await this.#store.results.saveResult(output);
    await this.#store.telemetry.saveTelemetry(output.telemetry);

    this.notify('complete', {
      tenant,
      status: output.status,
      duration: Date.now() - started,
      score: output.health,
    });

    const summary = summarizeResult(output);
    this.notify('summary', { ...summary });

    return output;
  }

  public async collect(): Promise<readonly LabExecutionResult[]> {
    const allScenarios = await Promise.all(
      [...this.#observed.keys()].map((tenantName) => this.#store.results.listResults(tenantName)),
    );
    return allScenarios.flat();
  }

  public async runPipeline<TInput, TOutput>(
    input: TInput,
    context: PluginContext,
    handlers: NoInfer<readonly ((input: TInput) => Promise<TOutput>)[]>,
  ): Promise<NoInfer<TOutput>[]> {
    const outputs: NoInfer<TOutput>[] = [];
    for (const handler of handlers) {
      const result = await handler(input);
      outputs.push(result as NoInfer<TOutput>);
      this.#observed.set(context.tenant, Date.now());
    }
    return outputs;
  }

  public async runStage<T extends { id: string }>(
    stage: T,
  ): Promise<{ ok: boolean; output?: string; message?: string }> {
    try {
      return { ok: true, output: `${stage.id}:ok` };
    } catch (error) {
      return { ok: false, message: String(error) };
    }
  }

  private notify(event: string, payload: Record<string, unknown>): void {
    for (const observer of this.observers) {
      observer(event, payload);
    }
  }
}

const routeKey = (steps: readonly string[]): string => {
  if (steps.length === 0) {
    return 'none';
  }
  return `${steps[0]}:${steps[steps.length - 1]}`;
};
