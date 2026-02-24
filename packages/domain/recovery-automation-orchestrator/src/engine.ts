import {
  AutomationPlanTemplate,
  DiagnosticsBus,
  DiagnosticsScope,
  StageContext,
  StageDefinition,
  StageExecution,
  StageName,
  WorkflowGraph,
  collectStageNames,
  runTemplatePlan,
  type OrchestrationNamespace,
  type OrchestrationRunId,
  type OrchestrationTag,
} from '@shared/automation-orchestration-runtime';
import type { Brand } from '@shared/type-level';
import { computeRiskProfile, computeSummary } from './analysis';
import { getCatalog, getCatalogPlan } from './catalog';
import {
  type AutomationEngineState,
  type AutomationExecutionConfig,
  type AutomationRun,
  type AutomationSummary,
  type AutomationTenantId,
  type AutomationRunId,
  type AutomationStatus,
  isComplete,
  isFailure,
  toRunStatus,
} from './types';
import type { Mutable } from '@shared/type-level';

type OrchestratorActions = {
  readonly scenarioId: string;
  readonly templateId: string;
};

type RunLifecycle = readonly [AutomationPlanTemplate, AutomationRun, StageExecution<unknown, unknown>[]];

type MutableAutomationRun = Mutable<AutomationRun> & { events: string[] };

const asRunStatus = (value: string): AutomationStatus =>
  value === 'completed' || value === 'failed' || value === 'in_progress' || value === 'queued' || value === 'blocked'
    ? (value as AutomationStatus)
    : 'queued';

const asTag = (value: string): OrchestrationTag => `tag:${value}` as OrchestrationTag;
const namespaceFromString = (value: string): OrchestrationNamespace => `namespace:${value}` as OrchestrationNamespace;
const scopeFromNamespace = (value: string): `scope:${string}` => `scope:${value}`;

const toRunScopeEvents = (runId: OrchestrationRunId): readonly string[] => [
  `run.scope.open:${runId}`,
  `run.scope.start:${runId}`,
];

export interface OrchestratorInputs {
  readonly tenant: AutomationTenantId;
  readonly config: AutomationExecutionConfig;
}

export class RecoveryAutomationOrchestrator {
  #state: AutomationEngineState<AutomationExecutionConfig>;
  readonly #tenant: AutomationTenantId;
  readonly #plans: ReturnType<typeof getCatalog>;

  public constructor({ tenant, config }: OrchestratorInputs) {
    this.#tenant = tenant;
    this.#state = {
      config,
      errors: [],
    };
    this.#plans = getCatalog(tenant);
  }

  public getState(): AutomationEngineState<AutomationExecutionConfig> {
    return this.#state;
  }

  public async bootstrap(planId: string): Promise<readonly StageName[]> {
    const resolvedPlan = getCatalogPlan(this.#tenant, planId);
    const fallback = this.#plans?.plans.at(0);
    if (!resolvedPlan && !fallback) {
      throw new Error(`No plan found for ${planId}`);
    }
    const template = resolvedPlan ?? fallback;
    if (!template) {
      throw new Error(`Plan not available for ${planId}`);
    }
    return collectStageNames(template.stages);
  }

  public async run(planId: string, actions: OrchestratorActions): Promise<AutomationSummary> {
    const plans = this.#plans?.plans ?? [];
    const selectedPlan = getCatalogPlan(this.#tenant, planId) ?? plans.at(0);
    if (!selectedPlan) {
      throw new Error(`No plan available for tenant ${this.#tenant}`);
    }

    const runId = `run:${actions.scenarioId}` as AutomationRunId;
    const graph = new WorkflowGraph(selectedPlan.stages, {
      tenant: this.#tenant,
      namespace: selectedPlan.namespace,
      revision: selectedPlan.version,
    });
    const executionOrder = graph.sorted();
    const [resolvedPlan, resolvedRun, outputs] = await this.#executePlan(selectedPlan, executionOrder, runId, actions);
    const status = toRunStatus({
      phase: resolvedRun.status,
      step: executionOrder.at(0) ?? 'stage:root',
      startedAt: resolvedRun.startedAt,
      completedAt: resolvedRun.finishedAt,
    });

    const updatedRun = this.#withStatus(resolvedRun, asRunStatus(status));
    const riskProfile = computeRiskProfile(updatedRun, [
      {
        name: 'execution-width',
        score: Math.max(0, 100 - updatedRun.events.length * 6),
        weight: 0.4,
        rationale: [`${executionOrder.length} stages`],
      },
      {
        name: 'plan-quality',
        score: Math.min(100, 20 + executionOrder.length * 8),
        weight: 0.2,
        rationale: ['stage topology'],
      },
      {
        name: 'health',
        score: isFailure(updatedRun.status) ? 10 : isComplete(updatedRun.status) ? 95 : 70,
        weight: 0.4,
        rationale: updatedRun.events.slice(0, 1),
      },
    ]);

    const lastSummary = computeSummary(updatedRun, [resolvedPlan], outputs);
    this.#state = {
      ...this.#state,
      currentRun: {
        ...updatedRun,
      },
      lastSummary: {
        ...lastSummary,
        riskScore: riskProfile.score,
      },
      errors: [],
    };
    return this.#state.lastSummary as AutomationSummary;
  }

  public async preview(planId: string): Promise<readonly StageName[]> {
    const templates = getCatalogTemplates(this.#tenant);
    return runTemplatePlan(templates, planId).map((stage) => stage.name);
  }

  async #executePlan(
    plan: AutomationPlanTemplate,
    executionOrder: readonly StageName[],
    runId: AutomationRunId,
    actions: OrchestratorActions,
  ): Promise<RunLifecycle> {
    const bus = new DiagnosticsBus((runId as unknown) as Brand<string, 'RunId'>);
    const diagnosticsScope = bus.withScope('run.lifecycle', {
      runId,
      plan: plan.id,
      trace: toRunScopeEvents(runId),
    } as const);
    bus.add('info', 'orchestrator.start', `starting ${actions.templateId}`, {
      tenant: this.#tenant,
      planId: plan.id,
    });

    await using scope = new AsyncDisposableStack();
    scope.defer(() => {
      diagnosticsScope[Symbol.dispose]();
    });

    const run: MutableAutomationRun = {
      id: runId,
      tenant: this.#tenant,
      scenarioId: actions.scenarioId as AutomationRun['scenarioId'],
      status: 'in_progress',
      stages: executionOrder,
      activeStage: executionOrder.at(0),
      startedAt: new Date().toISOString(),
      score: 50 as AutomationRun['score'],
      events: executionOrder.map((stage) => `${stage}:queued`),
      finishedAt: undefined,
    };

    const outputs: StageExecution<unknown, unknown>[] = [];
    let cursor: unknown = {
      planId: plan.id,
      templateId: actions.templateId,
      scenarioId: actions.scenarioId,
      runId,
      tenant: this.#tenant,
      risk: 0.5,
    };

    const staged = buildExecutions(plan.stages, executionOrder);
    for (let index = 0; index < staged.length; index += 1) {
      const definition = staged[index];
      const stageContext: StageContext = {
        tenant: this.#tenant,
        namespace: namespaceFromString(plan.namespace),
        scope: scopeFromNamespace('run'),
        runId,
        metadata: {
          source: `run:${actions.scenarioId}`,
          createdAt: run.startedAt,
          updatedAt: new Date().toISOString(),
        },
        tags: [asTag('runtime'), asTag('pipeline')],
      };
      const stageInput = {
        payload: cursor as Readonly<unknown>,
        context: stageContext,
        stageName: definition.name,
      };
      const result = await definition.run(stageInput, stageContext);
      run.events.push(`${definition.name}:${result.status}`);
      outputs.push(result);
      run.score = Math.min(
        100,
        (run.score + (1 - index / Math.max(staged.length, 1)) * 12) as AutomationRun['score'],
      ) as AutomationRun['score'];
      cursor = {
        output: result.output,
        elapsedMs: result.durationMs,
        source: definition.name,
      };
      (diagnosticsScope as DiagnosticsScope<{ plan: string; run: AutomationRunId }>).add(
        'info',
        `stage.${definition.name}`,
        `Executed ${definition.name}`,
      );
      scope.defer(() => {
        run.events.push(`stage:${definition.name}:closed`);
      });
    }

    run.status = outputs.every((item) => item.status !== 'error') ? 'completed' : 'failed';
    run.finishedAt = new Date().toISOString();
    bus.add('info', 'orchestrator.complete', `finished ${plan.id}`, { outputCount: outputs.length });
    run.events.push('run.completed');

    await bus.close();
    return [plan, run as AutomationRun, outputs] as const;
  }

  #withStatus(run: AutomationRun, status: AutomationStatus): AutomationRun {
    const riskProfile = computeRiskProfile(run, [
      {
        name: 'throughput',
        score: Math.min(100, 40 + run.stages.length * 7),
        weight: 0.75,
        rationale: ['pipeline progress'],
      },
      {
        name: 'durability',
        score: run.score ?? 0,
        weight: 0.25,
        rationale: ['stage health'],
      },
    ]);
    return {
      ...run,
      status,
      events: [...run.events, `risk:${riskProfile.score}`],
    };
  }
}

const buildExecutions = (definitions: readonly StageDefinition[], order: readonly StageName[]): readonly StageDefinition[] =>
  definitions.filter((definition) => order.includes(definition.name));

const getCatalogTemplates = (tenant: AutomationTenantId): readonly AutomationPlanTemplate[] => {
  const catalog = getCatalog(tenant);
  return catalog?.plans ?? [];
};
