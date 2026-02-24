import type {
  IncidentLabScenario,
  IncidentLabSignal,
  IncidentLabPlan,
  IncidentLabRun,
  AnyControlInput,
} from '@domain/recovery-incident-lab-core';
import {
  buildControlEventName,
  type ControlEvent,
  type ControlEventName,
  type ControlTimelineBucket,
  createControlArtifactId,
  createControlRunId,
  controlStages,
  type ControlStage,
  createControlPolicySignals,
} from '@domain/recovery-incident-lab-core';

export type RegistryPluginEvent<TScope extends string = string> = {
  readonly scope: `scope:${TScope}`;
  readonly name: ControlEventName<any, any, number>;
  readonly payload: unknown;
};

export interface ScenarioPluginAdapterOptions<TSignals extends readonly IncidentLabSignal['kind'][]> {
  readonly namespace: string;
  readonly scenario: IncidentLabScenario;
  readonly run: IncidentLabRun;
  readonly plan: IncidentLabPlan;
  readonly signals: TSignals;
}

export interface ControlAdapterArtifact<TSignals extends readonly IncidentLabSignal['kind'][]> {
  readonly planId: IncidentLabPlan['id'];
  readonly namespace: string;
  readonly runId: string;
  readonly eventStream: readonly RegistryPluginEvent[];
  readonly signalKinds: TSignals;
  readonly artifactIds: readonly string[];
}

export const mapScenarioToAdapter = <TSignals extends readonly IncidentLabSignal['kind'][]>(
  input: ScenarioPluginAdapterOptions<TSignals>,
): ControlAdapterArtifact<TSignals> => {
  const namespace = `adapter:${input.namespace}`;
  const artifactSignals = createControlPolicySignals(input.signals);
  const events = [
    {
      scope: 'scope:incident',
      name: buildControlEventName('tenant', 'input', 0),
      payload: {
        runId: input.run.runId,
        stages: controlStages,
        selectedSteps: input.plan.selected,
      },
    },
    {
      scope: 'scope:plan',
      name: buildControlEventName('topology', 'simulate', 1),
      payload: {
        plan: input.plan.queue,
        severity: input.scenario.severity,
      },
    },
    {
      scope: 'scope:run',
      name: buildControlEventName('policy', 'recommend', 2),
      payload: {
        results: input.run.results.length,
        tags: input.scenario.labels,
      },
    },
  ] as const;

  const controlInput = {
    scenario: input.scenario,
    plan: input.plan,
    signals: input.signals,
    governanceSignals: [],
  } satisfies AnyControlInput;
  void controlInput;

  return {
    planId: input.plan.id,
    namespace,
    runId: String(input.run.runId),
    eventStream: events,
    signalKinds: input.signals,
    artifactIds: [
      createControlArtifactId(`${namespace}-${input.run.runId}`),
      createControlRunId(`artifact:${input.plan.id}`),
      ...Object.keys(artifactSignals),
    ],
  };
};

const resolveKind = (stage: ControlStage): 'simulate' | 'observe' | 'input' => {
  if (stage === 'prepare' || stage === 'compose') {
    return 'input';
  }
  if (stage === 'telemetry' || stage === 'resolve') {
    return 'observe';
  }
  return 'simulate';
};

export const buildTimeline = (count: number, stage: ControlStage): readonly ControlEvent[] => {
  const timeline: ControlEvent[] = [];
  const buckets = [...controlStages];
  for (let index = 0; index < count; index += 1) {
    timeline.push({
      name: buildControlEventName('runtime', resolveKind(stage), index),
      bucket: `${stage}:${index}` as unknown as ControlTimelineBucket,
      emittedAt: new Date().toISOString(),
      payload: { stage, index },
    });
  }
  return timeline.toSorted((left, right) => left.name.localeCompare(right.name));
};

export const expandEvents = <TControls extends readonly string[]>(controls: TControls): readonly ControlEvent[] =>
  controls.map((control, index) => ({
    name: control as ControlEventName<'runtime', 'observe', number>,
    bucket: `expanded:${index}` as unknown as ControlTimelineBucket,
    emittedAt: new Date().toISOString(),
    payload: {
      order: index,
      control,
    },
  }));

export const buildRegistryAdapter = async (
  input: {
    readonly namespace: string;
    readonly scenarioId: string;
    readonly counts: readonly number[];
  },
): Promise<{
  readonly key: string;
  readonly timeline: readonly string[];
}> => {
  const timeline = [
    ...buildTimeline(Math.max(1, input.counts[0] ?? 1), 'prepare'),
    ...buildTimeline(Math.max(1, input.counts[1] ?? 1), 'compose'),
    ...buildTimeline(Math.max(1, input.counts[2] ?? 1), 'execute'),
  ];
  return {
    key: `${input.namespace}:${input.scenarioId}`,
    timeline: timeline.map((entry) => entry.name),
  };
};
