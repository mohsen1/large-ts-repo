import { createAsyncDisposableStack } from '@shared/recovery-synthesis-runtime';
import type { Brand, NoInfer } from '@shared/type-level';
import { collectByCategory as collectPlanViolations } from '@domain/recovery-scenario-lens/synthesis-advanced-types';
import { asPercent, asMillis, asScenarioPlanId } from '@domain/recovery-scenario-lens';

import { buildSnapshot } from '@domain/recovery-scenario-lens/synthesis-workspace-intelligence';
import {
  type OrchestrationInput,
  type OrchestratorEnvelope,
  type OrchestrationRunId,
  type OrchestratorState,
  type SimulationOutput,
} from './types';
import { RecoverySynthesisOrchestrator } from './orchestrator';
import { RecoverySynthesisQuantumFacade } from './quantum-runtime';
import { isWellFormedEnvelope } from './utils';

type LifecycleStage = 'planned' | 'simulated' | 'approved' | 'published' | 'failed';

type StageLog<T extends readonly string[]> = {
  readonly [K in keyof T]: `log.${T[K] & string}`;
};

export type LifecycleId = Brand<string, 'LifecycleId'>;

type StageSummary = {
  readonly stage: LifecycleStage;
  readonly runId: OrchestrationRunId;
  readonly startedAt: string;
  readonly commandCount: number;
};

export interface LifecycleEnvelope {
  readonly id: LifecycleId;
  readonly runId: OrchestrationRunId;
  readonly stage: LifecycleStage;
  readonly timeline: readonly string[];
  readonly metadata: Record<string, string>;
}

export interface LifecycleRunSummary {
  readonly stage: LifecycleStage;
  readonly warnings: readonly string[];
  readonly metrics: {
    readonly elapsedMs: number;
    readonly commandCount: number;
    readonly warningCount: number;
  };
}

export interface LifecycleFacadeConfig {
  readonly tenant: string;
  readonly enableQuantum: boolean;
}

const toId = (value: string): LifecycleId => `lifecycle.${value}` as LifecycleId;

class LifecycleState {
  readonly #timeline = new Map<LifecycleId, readonly string[]>();
  readonly #runs = new Map<LifecycleId, readonly LifecycleEnvelope[]>();

  add(runId: LifecycleId, envelope: LifecycleEnvelope): void {
    const history = this.#runs.get(runId) ?? [];
    this.#runs.set(runId, [...history, envelope]);
    this.#timeline.set(runId, [...(this.#timeline.get(runId) ?? []), envelope.stage]);
  }

  get(runId: LifecycleId): readonly LifecycleEnvelope[] {
    return this.#runs.get(runId) ?? [];
  }

  snapshot(runId: LifecycleId): readonly string[] {
    return this.#timeline.get(runId) ?? [];
  }
}

const toWarnings = <T extends readonly { readonly kind: string }[]>(events: NoInfer<T>): readonly string[] =>
  events.map((event) => `event:${event.kind}`);

export class QuantumLifecycleCoordinator {
  readonly #orchestrator = new RecoverySynthesisOrchestrator({
    storage: {
      save: async () => {},
      load: async () => undefined,
    },
    publisher: {
      publish: async () => {},
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });

  readonly #facade = new RecoverySynthesisQuantumFacade({
    storage: {
      save: async () => {},
      load: async () => undefined,
    },
    publisher: {
      publish: async () => {},
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });

  readonly #state = new LifecycleState();

  async orchestrate(
    input: OrchestrationInput,
    config: NoInfer<LifecycleFacadeConfig>,
  ): Promise<StageSummary> {
    using stack = createAsyncDisposableStack();
    const startedAt = new Date().toISOString();
    const runId = `${Date.now()}-${config.tenant}` as OrchestrationRunId;
    const envelope = await this.orchestrateInternal(input, runId);
    const timeline = stack.use([
      `timeline:${runId}`,
      `tenant:${config.tenant}`,
      `mode:${config.enableQuantum ? 'quantum' : 'baseline'}`,
    ]);

    this.#state.add(toId(runId), {
      id: toId(runId),
      runId,
      stage: envelope.status === 'ready' ? 'planned' : 'failed',
      timeline,
      metadata: {
        tenant: config.tenant,
        status: envelope.status,
        startedAt,
      },
    });

    return {
      stage: envelope.status === 'ready' ? 'planned' : 'failed',
      runId,
      startedAt,
      commandCount: envelope.model.activePlan?.commandIds.length ?? 0,
    };
  }

  private async orchestrateInternal(input: OrchestrationInput, runId: OrchestrationRunId): Promise<OrchestratorEnvelope> {
    return await this.#orchestrator.orchestrate(input).then((envelope) => ({
      ...envelope,
      runId,
    }));
  }

  async simulate(runId: OrchestrationRunId): Promise<LifecycleRunSummary> {
    const startedAt = Date.now();
    const envelope = await this.snapshotFromRun(runId);
    const stage = await this.#orchestrator.simulate(
      envelope.model.activePlan ?? {
        planId: asScenarioPlanId(`fallback.plan.${runId}`),
        blueprintId: envelope.model.scenarioId,
        version: 1,
        commandIds: [],
        createdAt: new Date().toISOString(),
        expectedFinishMs: asMillis(60_000),
        score: 0,
        constraints: [],
        warnings: ['baseline-plan'],
      },
    ).then((simulation) => {
      return ({
        runId,
        stage: 'simulated',
        commandCount: simulation.plan.commandIds.length,
        startedAt: new Date().toISOString(),
      } satisfies StageSummary);
    });

    const snapshot = await this.report(runId);
    this.#state.add(toId(runId), {
      id: toId(runId),
      runId,
      stage: 'simulated',
      timeline: [...snapshot.warnings, `simulate:${Date.now() - startedAt}`],
      metadata: {
        warnings: snapshot.warnings.length.toString(),
      },
    });

    return {
      stage: stage.stage,
      warnings: snapshot.warnings,
      metrics: {
        elapsedMs: Date.now() - startedAt,
        commandCount: stage.commandCount,
        warningCount: snapshot.warnings.length,
      },
    };
  }

  async publish(runId: OrchestrationRunId): Promise<void> {
    const run = await this.snapshotFromRun(runId);
    await this.#facade.publishRun(runId);

    this.#state.add(toId(runId), {
      id: toId(runId),
      runId,
      stage: run.status === 'ready' || run.status === 'simulated' ? 'approved' : 'failed',
      timeline: this.#state.snapshot(toId(runId)),
      metadata: {
        tenant: run.status,
        candidateCount: String(run.model.candidates.length),
      },
    });
  }

  async *stream(input: OrchestrationInput, config: LifecycleFacadeConfig): AsyncGenerator<LifecycleEnvelope> {
    const stack = createAsyncDisposableStack();
    try {
      const started = await this.orchestrate(input, config);
      const staged = toId(started.runId);

      yield {
        id: staged,
        runId: started.runId,
        stage: 'planned',
        timeline: this.#state.snapshot(staged),
        metadata: {
          stage: started.stage,
          startedAt: started.startedAt,
        },
      };

      const simulation = await this.simulate(started.runId);

      yield {
        id: staged,
        runId: started.runId,
        stage: simulation.stage,
        timeline: this.#state.snapshot(staged),
        metadata: {
          commandCount: String(simulation.metrics.commandCount),
          warningCount: String(simulation.metrics.warningCount),
        },
      };

      const report = await this.report(started.runId);
      yield {
        id: staged,
        runId: started.runId,
        stage: report.stage,
        timeline: [...report.warnings],
        metadata: {
          elapsedMs: String(report.metrics.elapsedMs),
          mode: config.enableQuantum ? 'quantum' : 'baseline',
        },
      };
    } finally {
      await stack[Symbol.asyncDispose]();
    }
  }

  async report(id: OrchestrationRunId): Promise<LifecycleRunSummary> {
    const timeline = this.#state.snapshot(toId(id));
    const snapshot = await this.snapshotFromRun(id);
    const warnings = toWarnings(snapshot.warnings.map((warning) => ({ kind: `warn:${warning}` })));

    return {
      stage: snapshot.status === 'simulated'
        ? 'simulated'
        : snapshot.status === 'ready'
          ? 'approved'
          : 'failed',
      warnings,
      metrics: {
        elapsedMs: Math.max(1, timeline.length * 11),
        commandCount: snapshot.model.activePlan?.commandIds.length ?? 0,
        warningCount: warnings.length,
      },
    };
  }

  async createReport(input: OrchestrationInput): Promise<LifecycleRunSummary> {
    const run = await this.#orchestrator.orchestrate(input);

    return {
      stage: 'approved',
      warnings: run.warnings,
      metrics: {
        elapsedMs: run.warnings.length,
        commandCount: run.model.candidates.length,
        warningCount: run.warnings.length,
      },
    };
  }

  private async snapshotFromRun(runId: OrchestrationRunId): Promise<OrchestratorEnvelope> {
    const state = await this.#orchestrator.snapshot();

    if (!state.currentRun || state.currentRun.runId !== runId) {
      throw new Error(`run missing for ${runId}`);
    }

    return {
      runId: state.currentRun.runId,
      status: state.currentRun.status,
      model: state.currentRun.model,
      warnings: state.currentRun.warnings,
      metrics: state.currentRun.metrics,
    };
  }
}

export const createLifecycleRunId = (seed: string): LifecycleId => toId(seed);

export const isLifecycleError = (value: unknown): value is { readonly reason: string } =>
  !!value && typeof value === 'object' && 'reason' in value;

export const projectStages = <TStates extends readonly LifecycleStage[]>(
  stages: NoInfer<TStates>,
): StageSummary[] =>
  stages.map((stage, index) => ({
    stage: stage === 'simulated' ? 'simulated' : stage === 'approved' ? 'approved' : stage,
    runId: `${index}-${stage}-run` as OrchestrationRunId,
    startedAt: new Date(index * 1_000).toISOString(),
    commandCount: stage.length,
  }));

export const asLifecycleLog = <T extends readonly string[]>(items: NoInfer<T>): StageLog<T> =>
  items.map((item) => `log.${item}`) as StageLog<T>;

export const summarizeLifecycle = async (
  coordinator: QuantumLifecycleCoordinator,
  input: OrchestrationInput,
  config: LifecycleFacadeConfig,
): Promise<{
  readonly runId: OrchestrationRunId;
  readonly stageCount: number;
  readonly stages: readonly string[];
}> => {
  const run = await coordinator.orchestrate(input, config);
  const summary = await coordinator.report(run.runId);
  return {
    runId: run.runId,
    stageCount: summary.warnings.length,
    stages: [run.stage, summary.stage],
  };
};

export const summarizeSimulationOutput = (output: SimulationOutput): {
  readonly timeline: number;
  readonly violations: number;
  readonly score: number;
} => {
  const byCategory = collectPlanViolations(output.timelineFrames as never);
  return {
    timeline: byCategory.plan + byCategory.simulate + byCategory.store + byCategory.govern + byCategory.alert,
    violations: output.violations.length,
    score: output.plan.score,
  };
};

export const buildLifecycleRunId = (runId: OrchestrationRunId): LifecycleId =>
  toId(runId);

export const isReadyToPublish = (summary: LifecycleRunSummary): boolean =>
  summary.metrics.warningCount === 0 && summary.metrics.commandCount > 0;

export const buildLifecycleSnapshot = async (
  coordinator: QuantumLifecycleCoordinator,
  runId: OrchestrationRunId,
): Promise<{
  readonly metadata: ReturnType<typeof buildSnapshot>;
  readonly summary: LifecycleRunSummary;
}> => {
  const summary = await coordinator.report(runId);
  const envelope = await coordinator['snapshotFromRun'](runId);
  const metadata = buildSnapshot({
    timeline: [] as never,
    plan: envelope.model.candidates[0]?.candidateId
      ? {
        planId: envelope.model.scenarioId as never,
        blueprintId: envelope.model.scenarioId,
        version: 1,
        commandIds: envelope.model.candidates[0]?.orderedCommandIds ?? [],
        createdAt: new Date().toISOString(),
        expectedFinishMs: asMillis(1_000),
        score: 1,
        constraints: [],
        warnings: envelope.warnings,
      }
      : {
        planId: `plan.${runId}` as never,
        blueprintId: envelope.model.scenarioId,
        version: 1,
        commandIds: [],
        createdAt: new Date().toISOString(),
        expectedFinishMs: asMillis(1_000),
        score: 0,
        constraints: [],
        warnings: envelope.warnings,
      },
    simulation: {
      simulationId: `snapshot.${runId}` as never,
      planId: `plan.${runId}` as never,
      scenarioId: envelope.model.scenarioId,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      frames: [],
      violations: [],
      riskScore: 0,
      confidence: asPercent(0),
      logs: [],
    },
    violations: [],
    readModel: {
      scenarioId: envelope.model.scenarioId,
      generatedAt: new Date().toISOString(),
      metadata: {
        workspaceRuntime: runId,
      },
      blueprint: envelope.model.blueprint,
      candidates: envelope.model.candidates,
      activePlan: envelope.model.activePlan,
      lastSimulation: envelope.model.lastSimulation,
    },
  });

  return {
    metadata,
    summary,
  };
};
