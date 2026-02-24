import { chunkBy, collect, createDisposableScope, mapIterator, byPriority } from '@shared/recovery-lab-kernel';
import type { NoInfer } from '@shared/type-level';
import {
  LabExecution,
  LabExecutionResult,
  LabLane,
  LabPlanTemplate,
  LabScenario,
  LabTelemetry,
  ScenarioSignal,
  StepPath,
} from './models';
import { PipelineExecution } from '@shared/recovery-lab-kernel';
import type { PluginSnapshot } from '@shared/recovery-lab-kernel';

interface PluginTrace {
  readonly pluginId: string;
  readonly runAt: number;
  readonly lane: LabLane;
}

export interface RegistryObserver {
  readonly onStart: (trace: PluginTrace) => void;
  readonly onFinish: (trace: PluginTrace, status: 'ok' | 'failed') => void;
}

export interface RegistryEvent {
  readonly kind: 'register' | 'unregister' | 'execute' | 'telemetry';
  readonly at: string;
  readonly payload: Record<string, string | number | boolean>;
}

type RankedStep = {
  readonly id: string;
  readonly pluginId: string;
  readonly priority: number;
  readonly output: {
    readonly status: 'ok' | 'warning' | 'blocked';
    readonly score: number;
  };
  readonly lane: LabLane;
  readonly meta: {
    readonly weight: number;
    readonly order: number;
  };
};

export class SimulationCatalog {
  readonly #signals = new Map<string, readonly ScenarioSignal[]>();
  readonly #plans = new Map<string, LabPlanTemplate>();
  readonly #observers = new Set<RegistryObserver>();
  readonly #events: RegistryEvent[] = [];

  public readonly active = true;

  public addScenario(scenario: LabScenario): void {
    this.#signals.set(scenario.scenarioId, scenario.signals);
    this.#emit({
      kind: 'register',
      at: new Date().toISOString(),
      payload: {
        tenant: scenario.tenant,
        scenarioId: scenario.scenarioId,
        active: this.active,
      },
    });
  }

  public addPlan(plan: LabPlanTemplate): void {
    this.#plans.set(plan.scenarioId, plan);
  }

  public listPlanRoutes(): readonly string[] {
    const routeIds = [...this.#plans.keys()];
    const grouped = chunkBy(routeIds, (planId) => planId.slice(0, 3));
    const flattened = collect(
      mapIterator(grouped.entries(), ([prefix, ids]) => `${prefix}:${ids.length}`),
    );
    return flattened.toSorted((left, right) => left.localeCompare(right));
  }

  public routeGroups(): ReadonlyMap<string, readonly string[]> {
    const groups = new Map<string, string[]>();
    for (const planId of this.#plans.keys()) {
      const prefix = planId.split('-')[0] ?? 'global';
      const current = groups.get(prefix) ?? [];
      groups.set(prefix, [...current, planId]);
    }
    return new Map([...groups.entries()].map(([key, values]) => [key, values.toSorted()]));
  }

  public attach(observer: RegistryObserver): void {
    this.#observers.add(observer);
  }

  public detach(observer: RegistryObserver): void {
    this.#observers.delete(observer);
  }

  public events(): readonly RegistryEvent[] {
    return [...this.#events];
  }

  public async simulate(execution: LabExecution, route: StepPath<string>): Promise<LabExecutionResult> {
    const plan = this.#plans.get(execution.scenarioId);
    if (!plan) {
      throw new Error(`Missing plan ${execution.scenarioId}`);
    }

    const rankedSteps = plan.stepIds.map<RankedStep>((pluginId, index) => ({
      id: `${route}:${pluginId}`,
      pluginId,
      priority: index,
      lane: execution.lane,
      output: {
        status: index === 0 ? 'ok' : index === 1 ? 'warning' : 'ok',
        score: Math.max(0, 1 - index * 0.1),
      },
      meta: {
        weight: 1 + index,
        order: index,
      },
    })).toSorted((left, right) => left.priority - right.priority);

    const steps = byPriority(rankedSteps);
    const stepsLog: string[] = [];
    const runAt = Date.now();

    await using _scope = createDisposableScope();

    for (const step of steps) {
      const trace: PluginTrace = {
        pluginId: step.pluginId,
        runAt: Date.now(),
        lane: step.lane,
      };

      for (const observer of this.#observers) {
        observer.onStart(trace);
      }

      await Promise.resolve();
      stepsLog.push(step.id);

      for (const observer of this.#observers) {
        observer.onFinish(trace, step.output.status === 'blocked' ? 'failed' : 'ok');
      }

      this.#emit({
        kind: 'execute',
        at: new Date().toISOString(),
        payload: {
          route: route,
          pluginId: step.pluginId,
          status: step.output.status,
          order: step.meta.order,
        },
      });
    }

    const telemetry: LabTelemetry = {
      runId: execution.executionId,
      tenant: execution.tenant,
      events: this.#events.length,
      metrics: {
        stepCount: steps.length,
        runtimeMs: Date.now() - runAt,
      },
      emitted: stepsLog,
    };

    const output: LabExecutionResult = {
      context: {
        tenant: execution.tenant,
        traceId: `${execution.tenant}-${execution.executionId}`,
        runId: execution.executionId,
        initiatedBy: 'lab-controller',
        startedAt: Date.now() - 12,
        workspace: route,
      },
      execution,
      steps: steps.map((step) => ({
        message: `${step.id} completed`,
        status: step.output.status === 'ok' ? 'ok' : step.output.status === 'warning' ? 'warning' : 'blocked',
        score: step.output.score,
        signalDelta: step.meta.weight / 10,
      })),
      health: steps.length > 0 ? 1 : 0,
      status: steps.every((step) => step.output.status !== 'blocked') ? 'passed' : 'failed',
      telemetry,
    };

    return output;
  }

  public snapshot(scope: string): PluginSnapshot {
    return {
      scope: scope as PluginSnapshot['scope'],
      total: this.#plans.size + this.#signals.size,
      enabled: this.active,
    };
  }

  public static mergeSnapshots<T extends ReadonlyArray<PluginSnapshot>>(
    snapshots: NoInfer<T>,
  ): readonly PluginSnapshot[] {
    return [...snapshots];
  }

  #emit(event: RegistryEvent): void {
    this.#events.push(event);
  }
}

export const mapSignalsByPriority = (
  signals: readonly ScenarioSignal[],
): PipelineExecution<readonly ScenarioSignal[], readonly ScenarioSignal[]> => {
  const ranked = signals.toSorted((left, right) => right.value - left.value);
  return {
    input: [...signals],
    output: [...ranked],
    touched: ranked.length,
    elapsedMs: 0,
  };
};
