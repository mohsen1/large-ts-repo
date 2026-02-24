import {
  buildSimulationTimeline,
  createClock,
  draftPlan,
  inferRisk,
  summarizeRun,
  type IncidentLabPlan,
  type IncidentLabRun,
  type IncidentLabSignal,
  type IncidentLabEnvelope,
} from '@domain/recovery-incident-lab-core';
import type { IncidentLabScenario } from '@domain/recovery-incident-lab-core';
import {
  createPluginPayload,
  getScenarioPluginRegistry,
  type ScenarioInputPayload,
  type ScenarioOutputPayload,
  type ScenarioPlugin,
  scenarioPluginContext,
  buildScenarioPluginChain,
} from '@domain/recovery-incident-lab-core/scenario-registry';
import {
  canonicalizeNamespace,
  type PluginContext,
  createPluginContext,
  runPluginSafe,
  withAsyncPluginScope,
} from '@shared/stress-lab-runtime';
import {
  buildSeries,
  type TimelineSeries,
} from '@data/recovery-incident-lab-store/temporal-series';
import { runDataPlugins, ScenarioExtensionRegistry } from '@data/recovery-incident-lab-store/extension-registry';
import type { RecoveryIncidentLabRepository } from '@data/recovery-incident-lab-store';
import { buildBlueprintFromSignals, summarizeBlueprint, buildSignalBuckets } from '@domain/recovery-incident-lab-core/advanced-types';

export interface OrchestrationWindow {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly series: readonly TimelineSeries[];
}

export interface ScenarioExecutionRow {
  readonly scenarioId: IncidentLabScenario['id'];
  readonly runId: IncidentLabRun['runId'];
  readonly signalCount: number;
  readonly status: IncidentLabRun['state'];
  readonly summary: string;
  readonly pluginTrail: readonly ScenarioOutputPayload[];
  readonly failedPlugins: readonly string[];
  readonly telemetryCount: number;
}

export interface AdvancedOrchestrationResult {
  readonly rows: readonly ScenarioExecutionRow[];
  readonly output: readonly string[];
  readonly window: OrchestrationWindow;
}

export type OrchestrationMode = 'strict' | 'adaptive';

export interface AdvancedOrchestrationInput {
  readonly scenarios: readonly IncidentLabScenario[];
  readonly mode: OrchestrationMode;
  readonly jitterPercent?: number;
  readonly includeTelemetry?: boolean;
}

interface PluginExecution {
  readonly plugin: ScenarioPlugin;
  readonly ok: boolean;
}

interface RunArtifacts {
  readonly pluginExecutions: readonly PluginExecution[];
  readonly outputPayload: ScenarioOutputPayload[];
  readonly telemetry: readonly IncidentLabEnvelope<unknown>[];
}

const DEFAULT_BATCH_JITTER = 4;

const buildRunFromTimeline = (scenario: IncidentLabScenario, plan: IncidentLabPlan, jitterPercent: number): IncidentLabRun => {
  const timeline = buildSimulationTimeline(scenario, plan.queue, {
    stepsPerMinute: Math.max(1, plan.queue.length),
    jitterPercent,
  });

  return {
    runId: `${scenario.id}:run:${Date.now()}` as IncidentLabRun['runId'],
    planId: plan.id,
    scenarioId: scenario.id,
    startedAt: createClock().now(),
    state: 'active',
    results: timeline.map((entry, index) => ({
      stepId: plan.queue[index] ?? ('' as IncidentLabRun['results'][number]['stepId']),
      startAt: entry.at,
      finishAt: entry.at,
      status: inferRisk(entry) === 'red' ? 'failed' : 'done',
      logs: [entry.at],
      sideEffects: entry.signals.map((signal) => signal.kind),
    })),
  };
};

const buildTelemetryFromRun = async (
  scenario: IncidentLabScenario,
  run: IncidentLabRun,
): Promise<readonly IncidentLabEnvelope<unknown>[]> => {
  const series = buildSeries(run, 500);
  const windows = series.buckets;
  const emitted: IncidentLabEnvelope<unknown>[] = [];
  for (const [bucketIndex, bucket] of windows.entries()) {
    for (const [pointIndex, point] of bucket.points.entries()) {
      const envelope: IncidentLabEnvelope<unknown> = {
        id: `${scenario.id}:telemetry:${bucketIndex}:${pointIndex}` as IncidentLabEnvelope['id'],
        labId: scenario.labId,
        scenarioId: scenario.id,
        payload: {
          bucket,
          point,
        },
        createdAt: bucket.from,
        origin: 'service/advanced-orchestrator',
      };
      emitted.push(envelope);
    }
  }

  return emitted;
};

const executeScenarioPlugins = async (
  scenario: IncidentLabScenario,
  plan: IncidentLabPlan,
  run: IncidentLabRun,
  mode: OrchestrationMode,
): Promise<RunArtifacts> => {
  const context = createPluginContext(scenario.owner, canonicalizeNamespace('recovery:incident-lab'), `${scenario.id}:plugins:${run.runId}`, {
    scenario,
    plan,
    run,
    mode,
  });

  const registry = getScenarioPluginRegistry();
  const chain =
    mode === 'strict'
      ? buildScenarioPluginChain<'strict'>(mode, { jitterPercent: 0, allowFallback: true })
      : buildScenarioPluginChain<'adaptive'>(mode, { jitterPercent: 0, allowFallback: false });

  const pluginExecutions: PluginExecution[] = [];
  const outputPayload: ScenarioOutputPayload[] = [];

  await using runScope = new AsyncDisposableStack();

  for (const plugin of chain) {
    runScope.use({
      [Symbol.dispose](): void {
        pluginExecutions.push({ plugin, ok: false });
      },
    });

    const payload: ScenarioInputPayload = createPluginPayload(scenario, mode === 'strict' ? 'normalize' : 'risk', run);
    const output = await runPluginSafe(
      plugin,
      context as PluginContext<Record<string, unknown>>,
      payload,
    );

    if (output.ok && output.value) {
      outputPayload.push(output.value);
      pluginExecutions.push({ plugin, ok: true });
    } else {
      pluginExecutions.push({ plugin, ok: false });
    }

    if (!output.ok) {
      break;
    }
  }

  const telemetry: IncidentLabEnvelope<unknown>[] = outputPayload
    .map((item) => ({
      id: `${scenario.id}:plugin:${run.runId}:${item.acceptedAt}` as IncidentLabEnvelope['id'],
      labId: scenario.labId,
      scenarioId: scenario.id,
      payload: { ...item, pluginTrail: outputPayload.length },
      createdAt: item.acceptedAt,
      origin: 'plugin-orchestrator',
    }))
    .filter((item) => item.payload.tags.length > 0);

  return {
    pluginExecutions,
    outputPayload,
    telemetry,
  };
};

const buildScenarioSignals = (run: IncidentLabRun): readonly IncidentLabSignal[] =>
  run.results.flatMap((result) =>
    result.sideEffects.map((sideEffect, index) => ({
      kind: (index % 2 === 0 ? 'capacity' : 'latency') as IncidentLabSignal['kind'],
      node: String(result.stepId),
      value: index + result.logs.length,
      at: result.startAt,
    })),
  );

export const runAdvancedScenarios = async (
  input: AdvancedOrchestrationInput,
  repository: RecoveryIncidentLabRepository,
): Promise<AdvancedOrchestrationResult> => {
  const startedAt = createClock().now();
  const rows: ScenarioExecutionRow[] = [];
  const output: string[] = [];
  const bucketSeries: TimelineSeries[] = [];
  const extensionRegistry = new ScenarioExtensionRegistry();

  const pluginOutputs: Map<string, readonly ScenarioOutputPayload[]> = new Map();

  const policyJitter = input.jitterPercent ?? DEFAULT_BATCH_JITTER;
  const config = scenarioPluginContext(input.mode);

  for (const scenario of input.scenarios) {
    const plan = draftPlan({ scenario, orderedBy: 'topology', requestedBy: scenario.owner }).plan;
    const run = buildRunFromTimeline(scenario, plan, policyJitter);

    const { outputPayload } = await executeScenarioPlugins(scenario, plan, run, input.mode);
    const scenarioSignals = buildScenarioSignals(run);
    const bucket = await buildSignalBuckets(scenarioSignals);
    void bucket;

    await repository.savePlan(plan);
    await repository.saveRun(run);
    if (input.includeTelemetry !== false) {
      for (const event of await buildTelemetryFromRun(scenario, run)) {
        await repository.appendEnvelope(event);
      }
    }

    const envelopesFromPlugins = outputPayload.map((item) => ({
      id: `${scenario.id}:output:${item.acceptedAt}` as IncidentLabEnvelope['id'],
      labId: scenario.labId,
      scenarioId: scenario.id,
      payload: item,
      createdAt: item.acceptedAt,
      origin: 'advanced-orchestrator-output',
    }));

    for (const envelope of envelopesFromPlugins) {
      await repository.appendEnvelope(envelope);
    }

    await runDataPlugins(scenario.id, {
      run,
      registry: extensionRegistry,
    });

    const summary = summarizeRun(run);
    const summaryPayload = [
      `total=${summary.total}`,
      `ready=${summary.ready}`,
      `running=${summary.running}`,
      `failed=${summary.failed}`,
    ].join(' ');
    const blueprint = buildBlueprintFromSignals({
      scenarioId: scenario.id,
      owner: scenario.owner,
      signals: ['capacity', 'latency', 'integrity', 'dependency'],
      steps: scenario.steps,
      queue: plan.queue,
    });
    const blueprintSummary = summarizeBlueprint(blueprint);
    const pluginSummary = outputPayload.map((item) => item.tags.join('|'));
    const series = buildSeries(run, 300);
    bucketSeries.push(series);

    await withAsyncPluginScope(
      {
        startedAt: createClock().now(),
        requestId: `advanced-orchestrator:${scenario.id}`,
        tenantId: scenario.owner,
        namespace: canonicalizeNamespace('recovery:incident-lab'),
      },
      async () => {
        pluginOutputs.set(scenario.id, outputPayload);
        void pluginSummary.join('|');
      },
    );

    rows.push({
      scenarioId: scenario.id,
      runId: run.runId,
      signalCount: scenarioSignals.length,
      status: run.state,
      summary: summaryPayload,
      pluginTrail: outputPayload,
      failedPlugins: outputPayload.filter((entry) => entry.score < 0).map((entry) => entry.tags[0]),
      telemetryCount: envelopesFromPlugins.length + (input.includeTelemetry === false ? 0 : series.buckets.length),
    });

    const signature = blueprintSummary.metric.score > 0 ? blueprintSummary.id : `${scenario.id}-degraded`;
    output.push(signature);
  }

  return {
    rows,
    output,
    window: {
      startedAt,
      finishedAt: createClock().now(),
      series: bucketSeries.toSorted((left, right) => left.points.length - right.points.length),
    },
  };
};

export const runAdvancedBatch = async (
  scenarios: readonly IncidentLabScenario[],
  repository: RecoveryIncidentLabRepository,
  shouldContinue: () => boolean,
): Promise<readonly string[]> => {
  const output: string[] = [];

  for (const scenario of scenarios) {
    if (!shouldContinue()) {
      break;
    }

    const result = await runAdvancedScenarios(
      {
        scenarios: [scenario],
        mode: shouldContinue() ? 'adaptive' : 'strict',
        includeTelemetry: true,
      },
      repository,
    );

    output.push(...result.output);
  }

  return output;
};

export const mergeBlueprintOutputs = <
  const TInput extends readonly ScenarioOutputPayload[],
>(outputs: TInput): {
  readonly signatures: readonly string[];
  readonly totalScore: number;
  readonly uniqueTags: readonly string[];
} => {
  const tuples = outputs.map((output) => ({
    signature: output.tags.join('|'),
    score: output.score,
    tags: output.tags,
  }));

  const signatures = tuples.map((entry) => entry.signature);
  const uniqueTags = [...new Set(tuples.flatMap((entry) => entry.tags))].sort();
  const totalScore = tuples.reduce((acc, entry) => acc + entry.score, 0);
  return { signatures, totalScore, uniqueTags };
};

export const bucketedSignalsFromScenario = (scenarios: readonly IncidentLabScenario[]): readonly IncidentLabSignal[] =>
  scenarios.flatMap((scenario) =>
    scenario.labels.map((label, index) => ({
      kind: (index % 2 === 0 ? 'dependency' : 'integrity') as IncidentLabSignal['kind'],
      node: `${scenario.id}:${index}`,
      value: label.length,
      at: new Date().toISOString(),
    })),
  );
