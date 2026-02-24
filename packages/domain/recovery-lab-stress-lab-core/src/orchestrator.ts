import { withAsyncDisposableScope } from '@shared/orchestration-lab-core';
import type { Brand } from '@shared/orchestration-lab-core';
import type { PluginName } from '@shared/orchestration-lab-core';
import { analyzeSignals, sampleSignalWindow } from './analysis';
import { buildPlanInput, planTemplates } from './plan';
import { buildRegistry, buildExecutionSeed, type LabExecutionInput } from './registry';
import type { LabMode, LabPlanInput, LabPlanOutput, LabRunSnapshot } from './types';
import type { PluginLifecycleContext, RecoverySignal } from '@shared/orchestration-lab-core';
import type { ChaosRuntimeSignal } from './contracts';
import { toCommandCorrelationId, toIncidentId } from './types';

export interface OrchestrationTimelineStep {
  readonly plugin: string;
  readonly startedAt: string;
  readonly latencyMs: number;
}

export interface OrchestrationResult {
  readonly runId: string;
  readonly tenant: string;
  readonly mode: LabMode;
  readonly title: string;
  readonly summary: string;
  readonly snapshot: LabRunSnapshot;
  readonly output: LabPlanOutput;
  readonly timeline: readonly OrchestrationTimelineStep[];
}

const toRuntimeFingerprint = (value: string): Brand<string, 'SignalHash'> => value as Brand<string, 'SignalHash'>;
const toRuntimeCategory = (category: RecoverySignal['category']): `signal:${string}` => `signal:${category}`;

const toChaosRuntime = (mode: LabMode, signal: RecoverySignal): ChaosRuntimeSignal => ({
  category: toRuntimeCategory(signal.category),
  severity: `severity:${signal.severity}` as ChaosRuntimeSignal['severity'],
  fingerprint: toRuntimeFingerprint(signal.id),
  mode,
  tenant: signal.tenant,
});

export class StressLabOrchestrator {
  #tenant: string;
  #mode: LabMode;

  public constructor(tenant: string, mode: LabMode) {
    this.#tenant = tenant;
    this.#mode = mode;
  }

  public async execute(input: LabPlanInput): Promise<OrchestrationResult> {
    const runtime = await sampleSignalWindow(input.signals.map((signal) => toChaosRuntime(this.#mode, signal)));
    const analysis = analyzeSignals(input);
    const registry = buildRegistry(this.#mode);
    const order = registry.executionOrder();
    const expectedCount = order.length;
    const timeline: OrchestrationTimelineStep[] = [];
    const context: PluginLifecycleContext = {
      tenant: input.tenant,
      runId: input.runId,
      commandId: input.commandId,
      correlationId: toCommandCorrelationId(`corr:${input.runId}`),
      startedAt: new Date().toISOString(),
    };

    let output: LabExecutionInput = buildExecutionSeed(input);

    return withAsyncDisposableScope(async () => {
      const executePlugin = registry.execute.bind(registry) as (
        name: PluginName,
        input: LabExecutionInput,
        context: PluginLifecycleContext,
        runtime: readonly ChaosRuntimeSignal[],
      ) => Promise<{ readonly output: LabExecutionInput }>;

      for (const pluginName of order) {
        const started = Date.now();
        const result = await executePlugin(pluginName, output, context, runtime);
        timeline.push({
          plugin: pluginName,
          startedAt: new Date(started).toISOString(),
          latencyMs: Date.now() - started,
        });
        output = result.output;
      }

      const snapshot: LabRunSnapshot = {
        runId: output.runId,
        tenant: output.tenant,
        mode: this.#mode,
        phase: 'execution',
        directiveCount: output.directives.length,
        artifactCount: output.artifacts.length,
      };

      return {
        runId: output.runId,
        tenant: this.#tenant,
        mode: this.#mode,
        title: output.title,
        summary: `mode=${this.#mode} expected=${expectedCount} observed=${timeline.length} fingerprint=${analysis.fingerprint}`,
        snapshot,
        output,
        timeline,
      };
    });
  }

  public async executeAll(tenant: string): Promise<readonly OrchestrationResult[]> {
    const templates = planTemplates(tenant).filter((template) => template.mode === this.#mode);
    const results: OrchestrationResult[] = [];
    for (const template of templates) {
      const plan = buildPlanInput(template);
      results.push(await this.execute(plan));
    }
    return results;
  }
}

export const createOrchestrator = (tenant: string, mode: LabMode): StressLabOrchestrator =>
  new StressLabOrchestrator(tenant, mode);

export const runChaosLab = async (tenant: string, mode: LabMode): Promise<OrchestrationResult> => {
  const orchestrator = createOrchestrator(tenant, mode);
  const template = planTemplates(tenant).find((entry) => entry.mode === mode);
  const selected = template ?? {
    tenant,
    mode,
    incident: toIncidentId(`${tenant}-incident`),
    title: `${mode} baseline`,
    labels: ['fallback', mode],
  };
  const plan = buildPlanInput(selected);
  return orchestrator.execute(plan);
};
