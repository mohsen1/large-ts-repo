import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import { topologicalExecutionOrder, canExecuteInParallel } from '@domain/recovery-readiness/src/dependencies';
import { buildPlanBlueprint, evaluateReadinessReadiness } from './planner';
import { MemoryReadinessRepository, type ReadinessRepository, createRunSummary } from '@data/recovery-readiness-store/src/repository';
import { ReadinessPipeline, buildSignalsStep, buildDraftStep, type StageContext } from './pipeline';
import { foldSignals } from '@domain/recovery-readiness/src/signals';
import { buildSignalMatrix, criticalityScoreByTarget } from '@domain/recovery-readiness/src/signal-matrix';
import {
  canRunParallel,
  validatePlanTargets,
  validateRiskBand,
} from '@domain/recovery-readiness/src/policy';
import {
  type RecoveryReadinessPlan,
  type RecoveryReadinessPlanDraft,
  type ReadinessPolicy,
  type ReadinessSignal,
  type ReadinessTarget,
  type ReadinessRunId,
} from '@domain/recovery-readiness';
import type { ReadinessReadModel } from '@data/recovery-readiness-store/src/models';
import type { SignalFilter } from '@data/recovery-readiness-store/src/models';
import type { ReadinessNotifier, ReadinessQueue } from './adapters';
import { EventBridgeReadinessPublisher, SqsReadinessQueue } from './adapters';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { SQSClient } from '@aws-sdk/client-sqs';
import { projectSignals } from '@domain/recovery-readiness/src/forecast';
import { readModelHealths, inventory } from '@data/recovery-readiness-store/src/analytics';
import { filterBySignalCriteria, rankBySignalVolume, sortByRiskBand, summarizeByOwner } from '@data/recovery-readiness-store/src/queries';

interface RecoveryCommandContext {
  command: string;
  requestedBy: string;
  correlationId: string;
}

export interface RecoveryRunnerOptions {
  repo?: ReadinessRepository;
  publisher?: ReadinessNotifier;
  queue?: ReadinessQueue;
  policy: ReadinessPolicy;
  notifierSource?: string;
}

const defaultSource = 'recovery-readiness-orchestrator';
const defaultBus = 'default';

export class RecoveryReadinessOrchestrator {
  private readonly repo: ReadinessRepository;
  private readonly publisher: ReadinessNotifier;
  private readonly queue: ReadinessQueue;
  private readonly policy: ReadinessPolicy;
  private readonly pipeline: ReadinessPipeline<{ draft: RecoveryReadinessPlanDraft; signals: ReadinessSignal[] }, ReadinessReadModel>;
  private bootstrapRuns = 0;

  constructor(options: RecoveryRunnerOptions) {
    this.repo = options.repo ?? new MemoryReadinessRepository();
    this.policy = options.policy;
    this.publisher =
      options.publisher ??
      new EventBridgeReadinessPublisher(new EventBridgeClient({}), defaultSource, options?.notifierSource ?? defaultBus);
    this.queue = options.queue ?? new SqsReadinessQueue(new SQSClient({}), 'https://queue.example.invalid/recovery-readiness');

    this.pipeline = new ReadinessPipeline([
      {
        name: 'validate-input',
        async execute(_context, input) {
          if (!input.draft.targetIds.length) {
            return { ok: false, errors: ['empty-target-set'] };
          }
          return {
            ok: true,
            value: input,
            errors: [],
          };
        },
      },
      {
        name: 'seed-signals',
        async execute(context, input) {
          const generated = await buildSignalsStep().execute(context, input.draft);
          if (!generated.ok) return { ok: false, errors: generated.errors };
          const generatedSignals = generated.value ?? [];

          return {
            ok: true,
            value: {
              draft: input.draft,
              signals: [...input.signals, ...generatedSignals],
            },
            errors: [],
          };
        },
      },
      {
        name: 'materialize',
        execute(context: StageContext, input: { draft: RecoveryReadinessPlanDraft; signals: ReadinessSignal[] }) {
          return buildDraftStep().execute(context, input);
        },
      },
    ]);
  }

  async bootstrap(draft: RecoveryReadinessPlanDraft, signals: ReadinessSignal[]): Promise<Result<string, Error>> {
    const policyTargets = this.lookupTargets(draft.targetIds);
    const readiness = evaluateReadinessReadiness(signals, policyTargets, this.policy);
    if (!readiness.canRun) {
      return fail(new Error(readiness.reasons.join('|')));
    }

    const context: StageContext = {
      runId: draft.runId,
      requestedBy: draft.owner,
      traceId: `bootstrap-${Date.now()}`,
    };

    const execution = await this.pipeline.run({ draft, signals }, context);
    if (!execution.ok || !execution.value) {
      return fail(new Error(execution.errors.join(';') || 'bootstrap-pipeline-failed'));
    }

    const blueprint = buildPlanBlueprint(draft, policyTargets);
    const candidate = this.enrichDraftModel(execution.value, blueprint);

    const validated = await this.applyPolicy(candidate, context);
    if (!validated.ok) return fail(validated.error);

    await this.repo.save(candidate);
    await this.publisher.publish({ action: 'created', runId: draft.runId, payload: candidate.plan });
    await this.queue.enqueue(draft.runId, 'readiness', candidate);
    this.bootstrapRuns += 1;

    return ok(validated.value);
  }

  async reconcile(runId: ReadinessRunId): Promise<Result<RecoveryReadinessPlan['state'], Error>> {
    const model = await this.repo.byRun(runId);
    if (!model) {
      return fail(new Error('run-missing'));
    }

    const matrix = buildSignalMatrix(model.signals);
    const summary = foldSignals(model.signals);
    const density = matrix.totalSignals > 0 ? summary.weightedScore / matrix.totalSignals : 0;
    const shouldSuppress = density > 8;

    if (shouldSuppress && model.plan.state === 'active') {
      model.plan.state = 'suppressed';
      await this.repo.save({ ...model, updatedAt: new Date().toISOString() });
      await this.publisher.publish({ action: 'updated', runId, payload: model.plan });
      return ok(model.plan.state);
    }

    if (!shouldSuppress && model.plan.state !== 'active') {
      model.plan.state = 'active';
      await this.repo.save({ ...model, updatedAt: new Date().toISOString() });
      await this.publisher.publish({ action: 'activated', runId, payload: model.plan });
      return ok(model.plan.state);
    }

    return ok(model.plan.state);
  }

  async status(command: RecoveryCommandContext): Promise<{
    runs: ReadinessReadModel[];
    ownerRuns: Map<string, number>;
    summary: ReturnType<typeof inventory>;
    trace: string;
  }> {
    const filter = command.command === 'list' ? undefined : ({ runId: command.correlationId } as SignalFilter);
    const runs = filter ? await this.repo.search(filter) : await this.repo.listActive();

    const ranked = sortByRiskBand([...runs]);
    const limited = rankBySignalVolume(ranked).slice(0, 10);
    const owners = summarizeByOwner(limited);

    return {
      runs: limited,
      ownerRuns: owners,
      summary: inventory(limited),
      trace: command.correlationId,
    };
  }

  async inspect(runId: ReadinessRunId): Promise<{ score: number; forecast: ReturnType<typeof projectSignals>; ownerBySignal: Record<string, number> }> {
    const model = await this.repo.byRun(runId);
    if (!model) {
      return {
        score: 0,
        forecast: projectSignals(runId, [], { baseSignalDensity: 0, volatilityWindowMinutes: 15 }),
        ownerBySignal: {},
      };
    }

    const byOwner = filterBySignalCriteria(Object.values(await this.repo.listActive()), {
      runId,
    }).reduce<Record<string, number>>((acc, next) => {
      const owner = next.plan.metadata.owner;
      acc[owner] = (acc[owner] ?? 0) + next.signals.length;
      return acc;
    }, {});

    const score = readModelHealths([model])[0]?.score ?? 0;
    const forecast = projectSignals(runId, model.signals, {
      baseSignalDensity: model.signals.length,
      volatilityWindowMinutes: 60,
    });

    return {
      score,
      forecast,
      ownerBySignal: byOwner,
    };
  }

  async healthSnapshot(): Promise<{ bootstrapRuns: number; status: string }> {
    const metrics = await this.repo.metrics();
    const summary = createRunSummary({
      createdRuns: metrics.activeRuns,
      updatedRuns: metrics.totalTracked,
      failedWrites: 0,
      totalSignals: metrics.activeSignals,
    }, metrics.totalTracked);

    return {
      bootstrapRuns: this.bootstrapRuns,
      status: summary.status,
    };
  }

  private async applyPolicy(
    model: ReadinessReadModel,
    context: StageContext,
  ): Promise<Result<string, Error>> {
    const targetRules = validatePlanTargets(this.policy as never, { targets: model.plan.targets });
    const riskRules = validateRiskBand(this.policy as never, model.signals);

    const dependencyGraph = topologicalExecutionOrder(model.directives);
    const parallelOk = canExecuteInParallel(model.directives, {
      edges: dependencyGraph.stages.flatMap((stage, stageIndex) =>
        stageIndex === 0
          ? []
          : stage.flatMap((directive) =>
              dependencyGraph.order
                .filter((candidate) => candidate.dependsOn.some((parent) => parent.directiveId === directive.directiveId))
                .map((candidate) => ({ from: directive.directiveId, to: candidate.directiveId })),
            ),
      ),
      allowParallelism: canRunParallel(
        {
          planId: `validation:${context.runId}` as ReadinessReadModel['plan']['planId'],
          runId: model.plan.runId,
          title: model.plan.title,
          objective: model.plan.objective,
          state: model.plan.state,
          createdAt: new Date().toISOString(),
          targets: model.plan.targets,
          windows: model.plan.windows,
          signals: model.signals,
          riskBand: model.plan.riskBand,
          metadata: model.plan.metadata,
        } as unknown as RecoveryReadinessPlan,
        this.policy,
      ),
    });

    const allReasons = [...targetRules.failures, ...riskRules.failures].map((failure) => failure.message);
    if (!targetRules.valid || !riskRules.valid || !parallelOk || dependencyGraph.errors.length > 0) {
      return fail(new Error(allReasons.join('|') || 'policy-decision-blocked'));
    }

    model.plan.state = 'active';
    model.revision = (model.revision ?? 0) + 1;
    model.updatedAt = new Date().toISOString();
    return ok(context.runId);
  }

  private enrichDraftModel(model: ReadinessReadModel, blueprint: ReturnType<typeof buildPlanBlueprint>): ReadinessReadModel {
    const signalDensity = buildSignalMatrix(model.signals);
    const byTarget = criticalityScoreByTarget(model.signals);

    const windows = blueprint.windows.map((window, index) => ({
      ...window,
      toUtc: new Date(Date.now() + (index + 1) * 10 * 60 * 1000).toISOString(),
    }));

    const directives = blueprint.directives.map((directive) => ({
      ...directive,
      directiveId: directive.directiveId,
      enabled: directive.enabled && !directive.name.includes('disabled'),
      retries: directive.retries,
    }));

    return {
      ...model,
      revision: 0,
      updatedAt: new Date().toISOString(),
      plan: {
        ...model.plan,
        windows,
        riskBand: blueprint.riskBand,
      },
      directives,
      signals: model.signals,
      targets: model.plan.targets,
    };
  }

  private lookupTargets(targetIds: ReadonlyArray<RecoveryReadinessPlanDraft['targetIds'][number]>) {
    return targetIds.map((targetId) => ({
      id: targetId as RecoveryReadinessPlanDraft['targetIds'][number],
      name: `Target ${targetId}`,
      ownerTeam: 'operations',
      region: 'us-east-1',
      criticality: 'medium' as ReadinessTarget['criticality'],
      owners: ['sre'],
    }));
  }
}
