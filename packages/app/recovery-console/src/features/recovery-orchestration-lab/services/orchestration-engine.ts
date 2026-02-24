import { asTuple } from '../domain/tuple-utils';
import { Brand, roundTo } from '../domain/type-utilities';
import {
  type OrchestrationEnvelope,
  type OrchestrationPlanInput,
  type OrchestrationPlanOutput,
  type PlanSnapshot,
  type RecoveryState,
  type RunStep,
  type PluginRunId,
  runPlanId,
} from '../domain/models';
import {
  inferExecutionOrder,
  type PluginName,
  type PluginLifecycleContext,
  type RuntimeSignalMetadata,
  type PluginRegistry,
} from '../runtime/plugin-types';
import { bootstrapPlugins } from '../runtime/plugin-loader';
import { ReplayPlanAdapter } from '../adapters/plan-adapter';

interface EngineDeps {
  readonly tenant: string;
  readonly now?: () => string;
}

export interface EngineResult {
  readonly snapshot: OrchestrationEnvelope<OrchestrationPlanOutput>;
  readonly registryOrder: readonly PluginName[];
  readonly runtimeSignals: readonly RuntimeSignalMetadata[];
  readonly elapsedMs: number;
}

class EngineScope {
  public readonly startedAt = new Date();
  public constructor(public readonly scope: string) {}
  public [Symbol.dispose](): void {
    this.startedAt.getTime();
  }
  public [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}

const toMetadataFromOutput = (output: OrchestrationPlanOutput, plugin: string): RuntimeSignalMetadata[] =>
  output.artifacts.flatMap((artifact) =>
    Object.entries(artifact.checksums).map(([checksum]) => ({
      category: `signal:${plugin}`,
      severity: `severity:${output.directives.length > 1 ? 'critical' : 'low'}`,
      fingerprint: `${artifact.runId}-${checksum}` as Brand<string, 'SignalHash'>,
    })),
  );

const toStep = (
  name: string,
  start: Date,
  elapsedMs: number,
  status: RunStep['status'],
  details?: Record<string, unknown>,
): RunStep => ({
  plugin: name,
  startedAt: start.toISOString(),
  elapsedMs: roundTo(elapsedMs, 2),
  status,
  details,
});

export class RecoveryOrchestrationEngine {
  public constructor(
    private readonly registry: PluginRegistry,
    private readonly deps: EngineDeps,
  ) {}

  public async run(plan: OrchestrationPlanInput): Promise<EngineResult> {
    const now = this.deps.now ?? (() => new Date().toISOString());
    const sequence = inferExecutionOrder(this.registry);
    const timeline: RunStep[] = [];
    const runtimeSignals: RuntimeSignalMetadata[] = [];
    let state: RecoveryState = 'queued';

    const context: PluginLifecycleContext = {
      tenant: plan.tenant,
      runId: plan.runId,
      commandId: `cmd:${plan.runId}` as PluginRunId,
      timestamp: now(),
    };

    const start = new Date();
    const transport = new ReplayPlanAdapter();
    await transport.connect(plan.tenant, plan.runId);
    let output: OrchestrationPlanOutput = await transport.execute(plan);

    state = 'warming';
    for (const pluginName of sequence) {
      const stepStart = new Date();
      try {
        const next = (await this.registry.run(pluginName, output as unknown, context, runtimeSignals)) as OrchestrationPlanOutput;
        output = next;
        timeline.push(toStep(pluginName, stepStart, new Date().getTime() - stepStart.getTime(), 'success'));
        runtimeSignals.push(...toMetadataFromOutput(output, pluginName));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        timeline.push(toStep(pluginName, stepStart, new Date().getTime() - stepStart.getTime(), 'failed', { message }));
        state = 'rollback';
        const failureSnapshot: OrchestrationEnvelope<OrchestrationPlanOutput> = {
          runId: runPlanId(plan.runId),
          tenant: plan.tenant,
          status: state,
          output,
          timeline: asTuple(timeline),
        };
        await transport.report(failureSnapshot);
        throw error;
      }
    }

    state = 'resolved';
    const finish: OrchestrationEnvelope<OrchestrationPlanOutput> = {
      runId: runPlanId(plan.runId),
      tenant: plan.tenant,
      status: state,
      output,
      timeline: asTuple(timeline),
    };

    await transport.report(finish);

    return {
      snapshot: finish,
      registryOrder: sequence,
      runtimeSignals: asTuple(runtimeSignals),
      elapsedMs: new Date().getTime() - start.getTime(),
    };
  }

  public snapshot(plan: OrchestrationPlanInput): PlanSnapshot {
    return {
      planId: runPlanId(`${plan.tenant}:${plan.incident}`),
      tenant: plan.tenant,
      incident: plan.incident,
      status: 'queued',
      horizon: plan.window,
      directives: [],
    };
  }

  public async runWithScope(plan: OrchestrationPlanInput): Promise<EngineResult> {
    await using _scope = new EngineScope(`tenant:${plan.tenant}`);
    return this.run(plan);
  }
}

export const createEngine = (tenant: string, now?: () => string): RecoveryOrchestrationEngine =>
  new RecoveryOrchestrationEngine(bootstrapPlugins.registry, { tenant, now });

export const executeEngine = async (
  engine: RecoveryOrchestrationEngine,
  plan: OrchestrationPlanInput,
): Promise<EngineResult> => engine.run(plan);
