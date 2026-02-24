import {
  type StrategyMode,
  type StrategyLane,
  type StrategyPlan,
  type StrategyStep,
  type StrategyResult,
  type StrategyTuple,
  type SignalEvent,
  asRunId,
  asSessionId,
  asScenarioId,
  asPlanId,
  asPluginId,
  asWorkspaceId,
  summarizePlan,
  StrategyContext,
  asPluginFingerprint,
  type PluginId,
} from './types';
import { createPipeline } from './pipeline';
import { StrategyTelemetry, summarizeEvents } from './telemetry';
import { flushAdapter, MemoryTelemetryAdapter, NoopTelemetryAdapter, type PublishReport } from './adapter';
import { bootstrapRegistryEntries, bootstrapDescriptors } from './bootstrap';
import { parseStrategyPlan, parseStrategyTuple } from './schema';
import type { PluginExecutionRecord } from './contracts';
import { createRegistry } from './registry';
import type { CampaignPlan } from '@domain/recovery-lab-adaptive-orchestration';
import { asCampaignStepId } from '@domain/recovery-lab-adaptive-orchestration';

export interface ServiceRequest<TSeed = Record<string, unknown>> {
  readonly workspace: string;
  readonly scenario: string;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
  readonly seed: TSeed;
  readonly tuple?: StrategyTuple;
}

export interface ServiceRunEnvelope<TOutput = unknown> {
  readonly request: ServiceRequest<Record<string, unknown>>;
  readonly result: StrategyResult<TOutput>;
  readonly outcome: StrategyResult<TOutput>['output'];
  readonly plan: StrategyPlan;
  readonly traces: readonly PluginExecutionRecord[];
  readonly telemetry: {
    readonly summary: ReturnType<typeof summarizeEvents>;
    readonly planSummary: string;
  };
}

export interface ServiceRuntimeConfig {
  readonly workspace: string;
  readonly runModeFallback: StrategyMode;
  readonly dryRun: boolean;
  readonly maxPlugins: number;
}

const defaultConfig: ServiceRuntimeConfig = {
  workspace: 'workspace:recovery-lab-intelligence',
  runModeFallback: 'analyze',
  dryRun: false,
  maxPlugins: 8,
};

const buildContext = (request: ServiceRequest, runId: string, stepPlans: readonly StrategyStep[]): StrategyContext => ({
  sessionId: asSessionId(`session:${runId}`),
  workspace: asWorkspaceId(request.workspace),
  runId: asRunId(`run:${runId}`),
  planId: asPlanId(`plan:${runId}`),
  scenario: asScenarioId(request.scenario),
  phase: {
    phase: request.mode,
    lane: request.lane,
    scenario: asScenarioId(request.scenario),
    runId: asRunId(`phase:${runId}`),
    workspace: asWorkspaceId(request.workspace),
    mode: request.mode,
    startedAt: new Date().toISOString(),
    payload: stepPlans,
  },
  baggage: {
    plugins: stepPlans.length,
    requestedAt: new Date().toISOString(),
  },
  plugin: asPluginId(`plugin:${runId}`),
});

export class RecoveryLabIntelligenceService {
  readonly #config: ServiceRuntimeConfig;
  readonly #adapter = new NoopTelemetryAdapter();
  readonly #registry = createRegistry(
    defaultConfig.workspace,
    ['simulate', 'analyze', 'stress', 'plan', 'synthesize'],
    bootstrapDescriptors.map((entry) => entry.contract),
  );
  readonly #defaultPhases = bootstrapRegistryEntries(5).map((entry) => parseStrategyTuple(entry.tuple));

  constructor(config: Partial<ServiceRuntimeConfig> = {}) {
    this.#config = { ...defaultConfig, ...config };
  }

  async run<TSeed extends Record<string, unknown>, TOutput>(request: ServiceRequest<TSeed>): Promise<ServiceRunEnvelope<TOutput>> {
    const plan = await this.buildPlan<TSeed>(request);
    const runId = `run:${Date.now()}`;
    const runContext = buildContext(request, runId, plan.steps);
    const telemetry = new StrategyTelemetry(runContext.sessionId, runContext.runId);
    const selectedPhases = this.normalizePhases(request.tuple ?? this.#defaultPhases[0]);
    const contracts = this.#registry.list();

    const runner = createPipeline<Record<string, unknown>, any[]>(
      selectedPhases,
      () => runContext,
      ...contracts.map(() => async (payload: Record<string, unknown>) => ({
        ...payload,
        runId,
        workspace: request.workspace,
      })),
    );

    const traces: PluginExecutionRecord[] = [];
    const events: SignalEvent[] = [];

    try {
      const output = await runner(request.seed as Record<string, unknown>, runContext);
      const adaptiveOutput = output as StrategyResult<TOutput>['output'];
      for (let i = 0; i < plan.steps.length; i += 1) {
        const step = plan.steps[i];
        const event = {
          source: 'orchestration',
          severity: request.mode === 'stress' ? 'error' : 'info',
          at: new Date().toISOString(),
          detail: {
            phase: selectedPhases[0],
            step: step.stepId,
            output: plan.steps.length > 0,
          },
        } satisfies SignalEvent;

        traces.push({
          traceId: `${runContext.runId}:${i}` as PluginId,
          phase: request.mode,
          startedAt: new Date().toISOString(),
          output: adaptiveOutput,
          diagnostics: [event],
          context: runContext,
          input: request.seed,
          completedAt: new Date().toISOString(),
        });

        events.push(event);
        telemetry.record(event);
      }

      const summary = summarizeEvents(events);
      const result: StrategyResult<TOutput> = {
        runId: runContext.runId,
        sessionId: runContext.sessionId,
        startedAt: runContext.phase.startedAt,
        endedAt: new Date().toISOString(),
        mode: request.mode,
        scenario: runContext.scenario,
        score: this.deriveScore(summary),
        output: adaptiveOutput,
        warnings: events.filter((event) => event.severity === 'warn'),
        events,
      };

      const report: ServiceRunEnvelope<TOutput> = {
        request: request as ServiceRequest<Record<string, unknown>>,
        result,
        outcome: adaptiveOutput,
        plan: {
          ...plan,
          metadata: {
            ...plan.metadata,
            runId,
            tuple: selectedPhases,
          },
        },
        traces,
        telemetry: {
          summary,
          planSummary: summarizePlan({ ...plan, steps: plan.steps }),
        },
      };

      const published = await flushAdapter(
        new MemoryTelemetryAdapter(runContext.workspace),
        asWorkspaceId(request.workspace),
        events,
      );
      const enriched = await this.enrichPublishResult(published);
      const publishedReport = this.annotatePublishResult(report, enriched);
      return publishedReport as ServiceRunEnvelope<TOutput>;
    } catch (error) {
      telemetry.record({
        source: 'orchestration',
        severity: 'critical',
        at: new Date().toISOString(),
        detail: {
          error: String(error),
        },
      });
      const result: StrategyResult<TOutput> = {
        runId: runContext.runId,
        sessionId: runContext.sessionId,
        startedAt: runContext.phase.startedAt,
        endedAt: new Date().toISOString(),
        mode: request.mode,
        scenario: runContext.scenario,
        score: 0,
        output: {} as StrategyResult<TOutput>['output'],
        warnings: telemetry.bySeverity('warn'),
        events: telemetry.toEvents(),
      };
      return {
        request: request as ServiceRequest<Record<string, unknown>>,
        result,
        outcome: {} as ServiceRunEnvelope<TOutput>['outcome'],
        plan: {
          ...plan,
          metadata: {
            ...plan.metadata,
            runId,
            error: String(error),
          },
        },
        traces,
        telemetry: {
          summary: summarizeEvents(telemetry.toEvents()),
          planSummary: summarizePlan(plan),
        },
      };
    }
  }

  async buildAdaptivePlan<TSeed>(request: ServiceRequest<TSeed>): Promise<StrategyPlan> {
    const bootstrap = parseStrategyPlan({
      planId: `plan:${request.scenario}:${Date.now()}` as StrategyPlan['planId'],
      sessionId: `session:${request.scenario}:${Date.now()}` as StrategyPlan['sessionId'],
      workspace: asWorkspaceId(request.workspace),
      scenario: asScenarioId(request.scenario),
      title: `${request.mode} plan for ${request.scenario}`,
      lanes: [request.lane],
      steps: [],
      metadata: {
        seeded: true,
        mode: request.mode,
      },
    });
    const tuple = this.normalizePhases(request.tuple ?? [request.mode, request.lane, 'seed', 1]);
    const plugins = bootstrapRegistryEntries(3).map((entry, index) => ({
      stepId: `step:${entry.tuple[0]}:${index}` as StrategyPlan['steps'][number]['stepId'],
      index,
      plugin: `plugin:${entry.tuple[0]}:${index}` as StrategyPlan['steps'][number]['plugin'],
      lane: request.lane,
      mode: tuple[0],
      inputs: {
        tuple: entry.tuple,
        mode: request.mode,
      },
      output: {
        ...bootstrap.metadata,
      },
      trace: {
        route: `${request.mode}/${entry.tuple[0]}-${entry.tuple[2]}-${index}`,
        attempts: 0,
        fingerprint: asPluginFingerprint(`fp:${entry.tuple[0]}`),
      },
    }));
    return {
      ...bootstrap,
      steps: plugins as readonly StrategyPlan['steps'][number][],
    };
  }

  async buildPlan<TSeed>(request: ServiceRequest<TSeed>): Promise<StrategyPlan> {
    const plan = await this.buildAdaptivePlan(request);
    return parseStrategyPlan(plan);
  }

  normalizePhases(tuple: StrategyTuple): StrategyTuple {
    return [tuple[0], tuple[1], `${tuple[2]}::normalized`, tuple[3]];
  }

  deriveScore(summary: ReturnType<typeof summarizeEvents>): number {
    const denominator = Math.max(
      1,
      summary.byMode.simulate + summary.byMode.analyze + summary.byMode.stress + summary.byMode.plan + summary.byMode.synthesize,
    );
    const warningPenalty = summary.warnings * 2 + summary.errors * 5 + summary.criticial * 10;
    return Number(Math.max(0, 1 - warningPenalty / (denominator * 25)).toFixed(4));
  }

  private annotatePublishResult<TOutput>(report: ServiceRunEnvelope<TOutput>, publish: PublishReport): ServiceRunEnvelope<TOutput> {
    return {
      ...report,
      plan: {
        ...report.plan,
        metadata: {
          ...report.plan.metadata,
          published: publish.published,
          publishSuccess: publish.success,
        },
      },
    };
  }

  private enrichPublishResult<T>(input: { readonly [key: string]: unknown }): Promise<PublishReport> {
    if (input.ok === true && 'value' in input) {
      return Promise.resolve(input.value as PublishReport);
    }
    return Promise.resolve({
      success: false,
      published: 0,
      skipped: 0,
    });
  }
}

export const runIntelligencePlan = async <
  TSeed extends Record<string, unknown>,
  TOutput = unknown,
>(
  request: ServiceRequest<TSeed>,
  config?: Partial<ServiceRuntimeConfig>,
): Promise<ServiceRunEnvelope<TOutput>> => {
  const service = new RecoveryLabIntelligenceService(config);
  return service.run(request);
};

export const toAdaptivePlan = (plan: StrategyPlan): CampaignPlan => ({
  tenantId: `tenant:${plan.workspace}` as CampaignPlan['tenantId'],
  campaignId: `campaign:${plan.scenario}` as CampaignPlan['campaignId'],
  planId: `plan:${plan.planId}` as CampaignPlan['planId'],
  title: plan.title,
  createdBy: 'recovery-lab-intelligence-core',
  mode: 'simulate',
  riskProfile: 0,
  signalPolicy: [],
  steps: plan.steps.map((step) => ({
    stepId: asCampaignStepId(step.stepId),
    intent: `intent:${step.mode}` as CampaignPlan['steps'][number]['intent'],
    action: `action:${step.plugin}`,
    expectedDurationMinutes: 5,
    constraints: [],
    dependencies: [],
    payload: step.output,
    tags: [`lane:${step.lane}`],
  })),
});
