import { NoInfer } from '@shared/type-level';
import type { IncidentLabPlan, IncidentLabSignal, StepId, IncidentLabScenario, LabTemplateStep } from './types';
import type { IncidentLabStudioInput, StudioRoute, StudioStage } from './incident-studio-types';
import { toStudioSignalWindow, type SignalBucketsByClass } from './incident-studio-signals';

export const schedulingStrategies = ['fifo', 'criticality', 'dependency-first', 'sla-aware'] as const;
export type SchedulingStrategy = (typeof schedulingStrategies)[number];

export type SortDescriptor<TValue> = {
  readonly by: keyof TValue;
  readonly desc: boolean;
};

export interface ScenarioScheduleSlot<TInput> {
  readonly route: StudioRoute;
  readonly stage: StudioStage;
  readonly at: string;
  readonly payload: TInput;
}

export interface ScheduleRunWindow {
  readonly startedAt: string;
  readonly elapsedMs: number;
  readonly steps: readonly StepId[];
  readonly plannedMinutes: number;
  readonly strategy: SchedulingStrategy;
}

export interface PlanBlueprint<TPlan extends readonly LabTemplateStep[] = readonly LabTemplateStep[]> {
  readonly planId: string;
  readonly strategy: SchedulingStrategy;
  readonly order: readonly number[];
  readonly steps: TPlan;
}

export interface OrchestrationTimelineFrame {
  readonly index: number;
  readonly at: string;
  readonly stage: 'discovery' | 'compose' | 'schedule' | 'execute' | 'telemetry' | 'report';
  readonly signature: string;
}

const toPlanSignature = (plan: IncidentLabPlan): string => `${plan.id}:${plan.selected.length}:${plan.queue.length}:${plan.state}`;

export const buildPlanTimeline = (
  input: {
    readonly plan: IncidentLabPlan;
    readonly startAt: string;
    readonly strategy: SchedulingStrategy;
  },
  limit = 20,
): readonly OrchestrationTimelineFrame[] => {
  const base = toPlanSignature(input.plan);
  const count = Math.min(limit, Math.max(6, input.plan.queue.length + 1));
  return Array.from({ length: count }, (_, index) => ({
    index,
    at: new Date(new Date(input.startAt).getTime() + index * 60_000).toISOString(),
    stage: index % 2 === 0 ? 'schedule' : 'execute',
    signature: `${base}:window:${index}:strategy=${input.strategy}`,
  }));
};

export const orderStepsByDependency = (steps: readonly LabTemplateStep[]): readonly StepId[] => {
  const queue = [...steps];
  return [...queue].toSorted((left, right) => right.expectedDurationMinutes - left.expectedDurationMinutes).map((step) => step.id);
};

const dependencyMap = (scenario: IncidentLabScenario): Map<string, LabTemplateStep> =>
  new Map(scenario.steps.map((step) => [String(step.id), step]));

export const buildDependencyOrder = (scenario: IncidentLabScenario): readonly StepId[] => {
  const idToStep = dependencyMap(scenario);
  const inFlight = new Set<string>(scenario.steps.map((step) => String(step.id)));
  const ordered: StepId[] = [];
  const readyQueue: string[] = [];

  for (let index = 0; index < Number.MAX_SAFE_INTEGER && ordered.length < scenario.steps.length; index += 1) {
    for (const [stepId, step] of idToStep.entries()) {
      if (!inFlight.has(stepId)) {
        continue;
      }

      const unmet = step.dependencies.some((dependency) => inFlight.has(String(dependency)));
      if (!unmet) {
        readyQueue.push(stepId);
      }
    }

    if (readyQueue.length === 0) {
      for (const stepId of inFlight) {
        const step = idToStep.get(stepId);
        if (step) {
          ordered.push(step.id);
          inFlight.delete(stepId);
        }
      }
      break;
    }

    for (const stepId of readyQueue.toSorted()) {
      const step = idToStep.get(stepId);
      if (!step) continue;
      ordered.push(step.id);
      inFlight.delete(stepId);
    }

    readyQueue.length = 0;
    if (ordered.length >= scenario.steps.length) break;
  }

  return ordered;
};

export const composeSchedule = (input: {
  readonly scenario: IncidentLabScenario;
  readonly signalWindow: readonly ReturnType<typeof toStudioSignalWindow>[];
  readonly strategy?: SchedulingStrategy;
}): {
  readonly plan: IncidentLabPlan;
  readonly windows: readonly OrchestrationTimelineFrame[];
  readonly load: number;
} => {
  const strategy = input.strategy ?? (input.signalWindow.length > 24 ? 'sla-aware' : 'dependency-first');
  const ordered =
    strategy === 'fifo'
      ? input.scenario.steps.map((step) => step.id)
      : strategy === 'criticality'
        ? [...input.scenario.steps]
            .toSorted((left, right) => right.expectedDurationMinutes - left.expectedDurationMinutes)
            .map((step) => step.id)
        : buildDependencyOrder(input.scenario);

  const load = input.signalWindow.length + input.scenario.steps.length;
  const plan: IncidentLabPlan = {
    id: `${input.scenario.id}:plan:${strategy}` as IncidentLabPlan['id'],
    scenarioId: input.scenario.id,
    labId: input.scenario.labId,
    selected: ordered,
    queue: ordered,
    state: load > 6 ? 'active' : 'ready',
    orderedAt: new Date().toISOString(),
    scheduledBy: 'incident-lab-core',
  };
  const windows = buildPlanTimeline({ plan, startAt: new Date().toISOString(), strategy }, 32);

  return { plan, windows, load };
};

export const scheduleSteps = <TSignals extends readonly ReturnType<typeof toStudioSignalWindow>[]>(
  input: {
    readonly plan: IncidentLabPlan;
    readonly sort: SortDescriptor<IncidentLabPlan>;
    readonly signals: NoInfer<TSignals>;
  },
): {
  readonly ordered: StepId[];
  readonly snapshot: {
    readonly windows: readonly OrchestrationTimelineFrame[];
    readonly route: StudioRoute;
    readonly signalSeries: SignalBucketsByClass<['availability', 'integrity', 'performance', 'compliance']>;
  };
} => {
  const ordered = [...input.plan.queue].toSorted((left, right) => {
    const leftValue = String(left);
    const rightValue = String(right);
    return input.sort.desc ? rightValue.localeCompare(leftValue) : leftValue.localeCompare(rightValue);
  });

    const signalsByKind = {
      'lane:availability': { kind: 'availability', signature: 'availability:low', count: 0, maxValue: 0, minValue: 0, values: [] },
      'lane:integrity': { kind: 'integrity', signature: 'integrity:low', count: 0, maxValue: 0, minValue: 0, values: [] },
      'lane:performance': { kind: 'performance', signature: 'performance:low', count: 0, maxValue: 0, minValue: 0, values: [] },
      'lane:compliance': { kind: 'compliance', signature: 'compliance:low', count: 0, maxValue: 0, minValue: 0, values: [] },
    } as Record<string, { readonly kind: 'availability' | 'integrity' | 'performance' | 'compliance'; readonly signature: string; readonly count: number; readonly maxValue: number; readonly minValue: number; readonly values: readonly IncidentLabSignal[] }>;

  for (const frame of input.signals) {
    const key = `lane:${frame.kind}`;
      const entry = signalsByKind[key] as {
        kind: 'availability' | 'integrity' | 'performance' | 'compliance';
        signature: string;
        count: number;
        maxValue: number;
        minValue: number;
        values: readonly IncidentLabSignal[];
      };
    signalsByKind[key as keyof typeof signalsByKind] = {
      ...entry,
      count: entry.count + frame.window.length,
      maxValue: Math.max(entry.maxValue, frame.window.length),
      minValue: entry.count === 0 ? frame.window.length : Math.min(entry.minValue, frame.window.length),
      values: [...entry.values, ...frame.window],
    };
  }

    const windows = buildPlanTimeline(
      {
        plan: {
          ...input.plan,
          queue: ordered,
          selected: ordered,
        },
        startAt: new Date().toISOString(),
        strategy: 'dependency-first',
      },
      24,
    );

    return {
      ordered,
      snapshot: {
        windows,
        route: 'incident-lab:route:scheduled' as StudioRoute,
        signalSeries: {
          ...{
            'lane:availability': {
              kind: 'availability',
              count: 0,
              maxValue: 0,
              minValue: 0,
              signature: 'availability:low',
              values: [],
            },
            'lane:integrity': {
              kind: 'integrity',
              count: 0,
              maxValue: 0,
              minValue: 0,
              signature: 'integrity:low',
              values: [],
            },
            'lane:performance': {
              kind: 'performance',
              count: 0,
              maxValue: 0,
              minValue: 0,
              signature: 'performance:low',
              values: [],
            },
            'lane:compliance': {
              kind: 'compliance',
              count: 0,
              maxValue: 0,
              minValue: 0,
              signature: 'compliance:low',
              values: [],
            },
          },
          ...signalsByKind,
        } as SignalBucketsByClass<['availability', 'integrity', 'performance', 'compliance']>,
      },
    };
};

export const projectWorkspace = (input: IncidentLabStudioInput): {
  readonly sessionRoute: StudioRoute;
  readonly window: ScheduleRunWindow;
} => {
  const scenario = {
    id: input.scenario.id,
    labId: input.scenario.labId,
    name: input.scenario.name,
    createdBy: input.scenario.createdBy,
    severity: input.scenario.severity,
    topologyTags: [...input.scenario.topologyTags],
    steps: [] as unknown as typeof input.scenario.steps,
    estimatedRecoveryMinutes: 0,
    owner: input.scenario.owner,
    labels: [...input.scenario.labels],
  } satisfies IncidentLabScenario;

  const windows = buildPlanTimeline(
    {
      plan: {
        id: `${input.scenario.id}:project:${input.sessionId}` as IncidentLabPlan['id'],
        scenarioId: input.scenario.id,
        labId: input.scenario.labId,
        selected: [],
        queue: [],
        state: 'ready',
        orderedAt: new Date().toISOString(),
        scheduledBy: 'incident-studio',
      } satisfies IncidentLabPlan,
      startAt: new Date().toISOString(),
      strategy: 'sla-aware',
    },
    8,
  );

  return {
    sessionRoute: `incident-lab:route:${input.sessionId}` as StudioRoute,
    window: {
      startedAt: new Date().toISOString(),
      elapsedMs: windows.length * 10_000,
      steps: (scenario.steps as readonly { id: StepId }[]).map((entry) => entry.id),
      plannedMinutes: Math.max(4, Math.ceil(windows.length / 4)),
      strategy: 'sla-aware',
    },
  };
};
