import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  runAdvancedScenarios,
  type AdvancedOrchestrationInput,
  type AdvancedOrchestrationResult,
  type OrchestrationMode,
  type ScenarioExecutionRow,
} from '@service/recovery-incident-lab-orchestrator';
import { InMemoryRecoveryIncidentLabRepository } from '@data/recovery-incident-lab-store';
import {
  createClock,
  createLabId,
  createScenarioId,
  createStepId,
  type IncidentLabScenario,
  type IncidentLabSignal,
  type LabTemplateStep,
} from '@domain/recovery-incident-lab-core';
import type { TimelineSeries } from '@data/recovery-incident-lab-store/temporal-series';

type Stage = 'idle' | 'running' | 'ready' | 'error';
type Severity = 'low' | 'medium' | 'high' | 'critical' | 'critical+';

interface SeedEnvelope {
  readonly seed: number;
  readonly mode: OrchestrationMode;
  readonly label: `seed:${number}`;
}

interface StudioState {
  readonly mode: OrchestrationMode;
  readonly includeTelemetry: boolean;
  readonly jitterPercent: number;
  readonly stage: Stage;
  readonly outputSeries: readonly TimelineSeries[];
  readonly rows: readonly ScenarioExecutionRow[];
  readonly output: readonly string[];
  readonly errors: readonly string[];
  readonly signatures: readonly string[];
}

type WithStage<T> = T & { readonly stage: Stage };

interface PluginContext<TInput> {
  readonly input: TInput;
  readonly startedAt: string;
  readonly at: string;
  readonly seed: number;
}

interface AdvancedPlugin<TInput, TOutput> {
  readonly id: `advanced-plugin:${string}`;
  readonly run: (context: PluginContext<TInput>) => Promise<TOutput>;
}

type PluginMap<TPlugins extends readonly AdvancedPlugin<any, any>[]> = {
  [Index in keyof TPlugins as `${Index & number}`]: TPlugins[Index];
};

type PluginResult<TPlugin extends AdvancedPlugin<any, any>> = TPlugin extends AdvancedPlugin<
  any,
  infer TResult
>
  ? TResult
  : never;

interface PluginOutput {
  readonly plugin: string;
  readonly status: 'ok' | 'warn' | 'fail';
  readonly result: string;
}

const resolvePlugins = <TInput,>(
  plugins: readonly AdvancedPlugin<TInput, PluginOutput>[],
): readonly AdvancedPlugin<TInput, PluginOutput>[] => plugins.toSorted((left, right) => left.id.localeCompare(right.id));

const stepFrom = (scenarioId: string, index: number): LabTemplateStep => ({
  id: createStepId(createScenarioId(scenarioId), index),
  label: `simulate-${scenarioId}-${index}`,
  command: `step-${index}-validate`,
  expectedDurationMinutes: (index % 3) + 1,
  dependencies: index === 0 ? [] : [createStepId(createScenarioId(scenarioId), index - 1)],
  constraints: [],
  owner: `${scenarioId}:owner` as LabTemplateStep['owner'],
});

const buildSeedScenarios = (count: number): readonly IncidentLabScenario[] => {
  const clock = createClock();
  return new Array(Math.max(1, count)).fill(0).map((_, index) => {
    const scenarioId = createScenarioId(`seed-${index + 1}`).toString() as string;
    const steps = new Array((index % 4) + 3).fill(0).map((_step, stepIndex) => stepFrom(scenarioId, stepIndex));
    const scenario = {
      id: createScenarioId(scenarioId),
      labId: createLabId(`lab:${index}`),
      name: `Recovery Incident ${index + 1}`,
      createdBy: `seed-builder-${index}`,
      severity: (['low', 'medium', 'high', 'critical', 'critical+'][index % 5] as Severity),
      topologyTags: [`topology:${index}`, 'core', index % 2 === 0 ? 'primary' : 'secondary'],
      steps,
      estimatedRecoveryMinutes: 13 + index,
      owner: `team-${index % 3}`,
      labels: ['recovery', 'incident-lab', `seed-${index}`],
      createdAt: clock.now(),
    } as IncidentLabScenario;
    return scenario;
  });
};

const seedSignals = (): readonly IncidentLabSignal[] => [
  { kind: 'capacity', node: 'ingress', value: 1.1, at: new Date().toISOString() },
  { kind: 'latency', node: 'api', value: 2.2, at: new Date(Date.now() + 1).toISOString() },
  { kind: 'integrity', node: 'store', value: 0.9, at: new Date(Date.now() + 2).toISOString() },
];

const seedPlugins = (): readonly AdvancedPlugin<AdvancedOrchestrationResult, PluginOutput>[] => [
  {
    id: 'advanced-plugin:signal-coverage' as const,
    run: async ({ input, at, seed }) => ({
      plugin: `signal-coverage:${seed}`,
      status: input.rows.length > 0 ? 'ok' : 'warn',
      result: `signals=${seedSignals().length} at=${at}`,
    }),
  },
  {
    id: 'advanced-plugin:row-density' as const,
    run: async ({ input, at, seed }) => ({
      plugin: `row-density:${seed}`,
      status: input.rows.length >= seed ? 'ok' : 'fail',
      result: `rows=${input.rows.length} signature=${input.output.join('|').slice(0, 64)}`,
    }),
  },
];

const summarizePlugins = <TPlugins extends readonly AdvancedPlugin<AdvancedOrchestrationResult, PluginOutput>[]>(
  plugins: PluginMap<TPlugins>,
): {
  readonly count: number;
  readonly ids: readonly string[];
} => {
  const ids = Object.keys(plugins as Record<string, AdvancedPlugin<AdvancedOrchestrationResult, PluginOutput>>).sort();
  return { count: ids.length, ids };
};

export const useRecoveryIncidentLabAdvancedOrchestration = () => {
  const [state, setState] = useState<StudioState>({
    mode: 'adaptive',
    includeTelemetry: true,
    jitterPercent: 2,
    outputSeries: [],
    stage: 'idle',
    rows: [],
    output: [],
    errors: [],
    signatures: [],
  });

  const [pluginOutputs, setPluginOutputs] = useState<readonly PluginOutput[]>([]);
  const [seed, setSeed] = useState<number>(4);

  const repository = useMemo(() => new InMemoryRecoveryIncidentLabRepository(), []);
  const scenarios = useMemo(() => buildSeedScenarios(seed), [seed]);

  const stageSummary = useMemo<readonly string[]>(() => {
    const aggregate = new Map<string, number>();
    for (const row of state.rows) {
      aggregate.set(row.status, (aggregate.get(row.status) ?? 0) + 1);
    }
    return [...aggregate.entries()].map(([status, count]) => `${status}:${count}`);
  }, [state.rows]);

  useEffect(() => {
    void stageSummary;
  }, [stageSummary]);

  const withRuntimeContext = useCallback(async <T,>(
    envelope: SeedEnvelope,
    action: (config: AdvancedOrchestrationInput) => Promise<T>,
  ): Promise<WithStage<{ value: T }>> => {
    const config = {
      scenarios,
      mode: envelope.mode,
      jitterPercent: envelope.seed % 5,
      includeTelemetry: state.includeTelemetry,
    };

    const value = await action(config);
    return { ...config, stage: state.stage, value };
  }, [scenarios, state.includeTelemetry, state.stage]);

  const runAdvanced = useCallback(async () => {
    setState((previous) => ({ ...previous, stage: 'running', errors: [], output: [] }));
    const plugins = resolvePlugins(seedPlugins());
    const context = {
      input: {
        scenarios,
        mode: state.mode,
        jitterPercent: state.jitterPercent,
        includeTelemetry: state.includeTelemetry,
      },
      startedAt: createClock().now(),
      at: new Date().toISOString(),
      seed,
    };

    const diagnostics = {
      count: summarizePlugins(plugins).count,
      ids: summarizePlugins(plugins).ids,
    };

    try {
      const response = await withRuntimeContext(
        {
          seed,
          mode: state.mode,
          label: `seed:${seed}`,
        },
        () => runAdvancedScenarios(context.input, repository),
      );
      const mapped = plugins.map((plugin) =>
        plugin.run({
          input: response.value,
          startedAt: createClock().now(),
          at: new Date().toISOString(),
          seed,
        }),
      );
      const outputs: PluginOutput[] = [];
      for (const task of mapped) {
        const result = await task;
        outputs.push(result);
      }

      setPluginOutputs(outputs);
      setState((previous) => ({
        ...previous,
        stage: 'ready',
        rows: response.value.rows,
        outputSeries: response.value.window.series,
        output: response.value.output,
        signatures: [
          `plugin-count:${diagnostics.count}`,
          ...diagnostics.ids,
          `signatures:${response.value.output.length}`,
        ],
        errors: [],
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        stage: 'error',
        errors: [error instanceof Error ? error.message : 'advanced orchestration failed'],
      }));
    }
  }, [repository, scenarios, seed, state.mode, state.includeTelemetry, withRuntimeContext]);

  const setMode = useCallback((mode: OrchestrationMode) => {
    setState((current) => ({ ...current, mode }));
  }, []);

  const setTelemetry = useCallback((enabled: boolean) => {
    setState((current) => ({ ...current, includeTelemetry: enabled }));
  }, []);

  const addSeed = useCallback(() => {
    setSeed((current) => (current + 1));
  }, []);

  const reset = useCallback(() => {
    setState({
      mode: state.mode,
      includeTelemetry: state.includeTelemetry,
      jitterPercent: 0,
      outputSeries: [],
      stage: 'idle',
      rows: [],
      output: [],
      errors: [],
      signatures: [],
    });
    setPluginOutputs([]);
  }, [state.mode, state.includeTelemetry]);

  return {
    state: {
      ...state,
      pluginOutputs,
      seed,
      stageSummary,
      scenarioCount: scenarios.length,
    },
    runAdvanced,
    setMode,
    setTelemetry,
    addSeed,
    reset,
  };
};
