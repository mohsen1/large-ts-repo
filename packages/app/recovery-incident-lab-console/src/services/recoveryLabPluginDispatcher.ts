import type { IncidentLabScenario } from '@domain/recovery-incident-lab-core';
import {
  buildControlPlugins,
  createControlRun,
  createControlRunId,
} from '@domain/recovery-incident-lab-core';

import type { PluginDefinition, PluginKind } from '@shared/stress-lab-runtime';

type PluginResult<TInput, TOutput> = {
  readonly input: TInput;
  readonly output: TOutput;
};

export interface DispatchSnapshot<TPlugin extends string = string> {
  readonly key: TPlugin;
  readonly status: 'ok' | 'warn' | 'fail';
  readonly stage: string;
}

const toDispatchOrder = (count: number): readonly number[] => new Array(Math.max(1, count)).fill(0).map((_, index) => index);

export const dispatchControlChain = async (
  scenario: IncidentLabScenario,
  seed: number,
): Promise<{
  readonly id: string;
  readonly events: readonly string[];
  readonly warnings: readonly string[];
}> => {
  const controlPlugins = buildControlPlugins();
  const order = toDispatchOrder(seed);
  const runId = createControlRunId(`${scenario.id}:${seed}`);
  const orderedPlugins = controlPlugins.toSorted((left, right) => left.name.localeCompare(right.name));
  const output = await createControlRun();
  const events: string[] = [];
  const warnings: string[] = [];

  const snapshots: DispatchSnapshot[] = [];
  for (const index of order) {
    const plugin = orderedPlugins[index % orderedPlugins.length] as PluginDefinition<unknown, unknown, Record<string, unknown>, PluginKind>;
    snapshots.push({
      key: plugin.name,
      status: plugin.id ? 'ok' : 'fail',
      stage: ['prepare', 'compose', 'execute', 'telemetry', 'resolve', 'close'][index % 6],
    });
  }

  for (const snapshot of snapshots.toSorted((left, right) => left.key.localeCompare(right.key))) {
    events.push(`${snapshot.key}:${snapshot.stage}:${snapshot.status}`);
    if (snapshot.status === 'fail') {
      warnings.push(`plugin-failed:${snapshot.key}`);
    }
  }

    return {
      id: runId,
      events: [
        ...events,
        ...output.output,
        `registry:${output.runId}`,
        `scenario:${String(scenario.id)}`,
      ],
    warnings,
  };
};

export const buildDispatchPlan = <const TPlugins extends readonly string[]>(plugins: TPlugins): readonly PluginResult<TPlugins[number], number>[] => {
  const output = plugins
    .map((plugin, index) => ({
      input: plugin,
      output: index + plugin.length,
    }))
    .toSorted((left, right) => left.output - right.output);
  return output as PluginResult<TPlugins[number], number>[];
};
