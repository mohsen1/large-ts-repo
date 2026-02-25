import {
  type PipelineRequest,
  type PipelineReport,
  type PipelineContext,
  type PluginOutput,
  type SynthesisPluginName,
  type SynthesisTraceId,
  executePipeline,
} from '@shared/recovery-synthesis-runtime';
import { buildSynthesisRegistry } from './synthesis-registry';
import type {
  SynthesisInput,
  SynthesisWorkspace,
  SynthesisRuntimeId,
  SynthesisPluginPayload,
} from './synthesis-types';
import {
  asPercent,
  asScenarioId,
  asPlanCandidateId,
  asScenarioPlanId,
  asMillis,
} from './types';

type RuntimeDependency = {
  runtimeId: string;
  labels?: { tenant?: string };
};

export interface RuntimeResult {
  readonly traceId: SynthesisTraceId;
  readonly runtimeId: SynthesisRuntimeId;
  readonly workspace: SynthesisWorkspace;
  readonly stages: readonly string[];
}

export interface RuntimeDependencyContext {
  readonly runtimeId: string;
  readonly labels?: { tenant?: string };
}

const isPayload = (value: unknown): value is SynthesisPluginPayload => {
  return (
    !!value &&
    typeof value === 'object' &&
    'source' in value &&
    'commandOrder' in value &&
    Array.isArray((value as { commandOrder: readonly unknown[] }).commandOrder)
  );
};

export class RecoveryScenarioLensRuntime {
  readonly #registry = buildSynthesisRegistry();
  readonly #runtimeId: SynthesisRuntimeId;
  readonly #tenant: string;

  constructor(private readonly dependency: RuntimeDependency) {
    this.#runtimeId = `runtime.${dependency.runtimeId}` as SynthesisRuntimeId;
    this.#tenant = dependency.labels?.tenant ?? 'default';
  }

  private run(
    input: SynthesisInput,
    entry: SynthesisPluginName,
    mode: PipelineContext['mode'],
  ): Promise<PipelineReport<SynthesisPluginPayload, SynthesisInput>> {
    const request: PipelineRequest<SynthesisInput> = {
      traceId: input.traceId,
      mode,
      metadata: {
        'cfg:tenant': this.#tenant,
        'cfg:runtime': this.#runtimeId,
      },
      input,
    };

    return executePipeline<SynthesisInput, SynthesisPluginPayload, readonly any[]>(
      request,
      this.#registry as unknown as never,
      entry,
    );
  }

  async execute(input: SynthesisInput): Promise<RuntimeResult> {
    const report = await this.run(input, 'plugin:ingest', 'shadow');

    const timeline = report.timeline
      .map((entry) => {
        if (!isPayload(entry.payload)) {
          throw new Error(`pipeline produced malformed payload in ${entry.plugin}`);
        }
        return entry.payload;
      });

    const finalPayload = timeline.at(-1);
    const commandOrder = finalPayload?.commandOrder ?? [];

    const workspace: SynthesisWorkspace = {
      runtimeId: this.#runtimeId,
      traceId: input.traceId,
      events: timeline.map((payload, index) => ({
        traceId: input.traceId,
        kind: index % 2 === 0 ? 'plan' : 'simulate',
        payload,
        when: new Date().toISOString(),
      } satisfies SynthesisWorkspace['events'][number])),
      timeline,
      latestOutput: finalPayload
        ? {
            traceId: input.traceId,
            generatedAt: new Date().toISOString(),
            commandTimeline: commandOrder.map((command, index) => ({
              commandId: command.commandId,
              stage: `stage:${index}` as const,
            })),
            plan: {
              planId: asScenarioPlanId(`plan.${this.#runtimeId}.${input.traceId}`),
              blueprintId: asScenarioId(input.blueprint.scenarioId),
              version: 1,
              commandIds: commandOrder.map((command) => command.commandId),
              createdAt: new Date().toISOString(),
              expectedFinishMs: asMillis(commandOrder.length * 1000),
              score: Math.max(0, 1 - finalPayload.warnings.length / 100),
              constraints: [],
              warnings: finalPayload.warnings,
            },
            readModel: {
              scenarioId: asScenarioId(input.blueprint.scenarioId),
              generatedAt: new Date().toISOString(),
              metadata: {
                runtime: this.#runtimeId,
                tenant: this.#tenant,
              },
              blueprint: input.blueprint,
              candidates: [
                {
                  candidateId: asPlanCandidateId(`candidate.${this.#runtimeId}.${input.traceId}`),
                  blueprintId: asScenarioId(input.blueprint.scenarioId),
                  orderedCommandIds: commandOrder.map((command) => command.commandId),
                  windows: [],
                  score: Math.max(0, 1 - finalPayload.warnings.length / 10),
                  risk: 0,
                  resourceUse: commandOrder.length,
                },
              ],
              activePlan: {
                planId: asScenarioPlanId(`plan.active.${this.#runtimeId}`),
                blueprintId: asScenarioId(input.blueprint.scenarioId),
                version: 1,
                commandIds: commandOrder.map((command) => command.commandId),
                createdAt: new Date().toISOString(),
                expectedFinishMs: asMillis(commandOrder.length * 1000),
                score: Math.max(0, 1 - finalPayload.warnings.length / 8),
                constraints: [],
                warnings: finalPayload.warnings,
              },
              lastSimulation: undefined,
            },
          }
        : undefined,
    };

    return {
      traceId: input.traceId,
      runtimeId: this.#runtimeId,
      workspace,
      stages: report.timeline.map((frame) => frame.stage),
    };
  }
}

export const createSynthesis = (dependency: RuntimeDependencyContext): RecoveryScenarioLensRuntime =>
  new RecoveryScenarioLensRuntime(dependency);
