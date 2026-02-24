import { normalize, makeRunId, asChronicleChannel, asChronicleStepId, asChronicleTag, asChroniclePhase } from './types.js';
import type {
  ChronicleBlueprint,
  ChronicleContext,
  ChronicleId,
  ChronicleNode,
  ChronicleObservation,
  ChroniclePhase,
  ChroniclePhaseInput,
  ChroniclePhaseOutput,
  ChroniclePluginDescriptor,
  ChronicleRoute,
  ChronicleRunId,
  ChronicleScenario,
  ChronicleStatus,
  TimelineTuple,
} from './types.js';
import { ChroniclePluginRegistry } from './registry.js';

export interface SimulationCheckpoint {
  readonly timestamp: number;
  readonly status: ChronicleStatus;
  readonly score: number;
}

export interface SimulationWindow {
  readonly id: ChronicleId;
  readonly route: ChronicleRoute;
  readonly checkpoints: readonly SimulationCheckpoint[];
}

export interface SimulationResult {
  readonly runId: ChronicleRunId;
  readonly status: ChronicleStatus;
  readonly score: number;
  readonly windows: readonly SimulationWindow[];
  readonly finalPayload: unknown;
}

export type TimelineInput<TState extends Record<string, unknown>> = {
  readonly blueprint: ChronicleBlueprint;
  readonly tenant: string;
  readonly state: TState;
};

export interface TimelineNode {
  readonly id: ChronicleId;
  readonly label: string;
  readonly parents: readonly ChronicleId[];
  readonly children: readonly ChronicleId[];
  readonly payloadHash: string;
}

const timelinePhases = ['phase:bootstrap', 'phase:execution', 'phase:verification'] satisfies readonly ChroniclePhase<string>[];

const toTimelineTuple = (route: ChronicleRoute, tag: string): TimelineTuple =>
  [asChronicleTag(tag), asChronicleChannel(route), 'control'] as const;

const scoreBy = (value: number | ChroniclePhase<string>): number =>
  (typeof value === 'number' ? value : value.length) * 7 + 3;

class TimelinePlan {
  readonly #nodes = new Map<ChronicleId, TimelineNode>();
  readonly #edges = new Map<ChronicleId, ChronicleId[]>();

  public constructor(
    private readonly tenant: string,
    private readonly blueprint: ChronicleBlueprint,
  ) {
    this.#ingest();
  }

  #ingest(): void {
    const nodePrefix = `${this.tenant}:`;
    for (const node of this.blueprint.phases) {
      const id = `${nodePrefix}${node.id}` as ChronicleId;
      this.#nodes.set(id, {
        id,
        label: node.label,
        parents: [],
        children: [],
        payloadHash: `${node.id}:${node.dependencies.join(':')}`,
      });
    }

    for (const edge of this.blueprint.edges) {
      const from = `${nodePrefix}${edge.from}` as ChronicleId;
      const to = `${nodePrefix}${edge.to}` as ChronicleId;
      const children = this.#edges.get(from) ?? [];
      this.#edges.set(from, [...children, to]);

      const target = this.#nodes.get(to);
      if (!target) continue;
      this.#nodes.set(to, { ...target, parents: [...target.parents, from] });
    }

    for (const [nodeId, children] of this.#edges.entries()) {
      const source = this.#nodes.get(nodeId);
      if (source) {
        this.#nodes.set(nodeId, { ...source, children: [...children] });
      }
    }
  }

  public traversal(): readonly ChronicleId[] {
    return [...this.#nodes.keys()].sort();
  }
}

export class ChronologySimulator {
  public constructor(
    private readonly registry: ChroniclePluginRegistry<readonly ChroniclePluginDescriptor[]>,
    private readonly scenario: ChronicleScenario,
  ) {}

  public async run<TState extends Record<string, unknown>>(input: TimelineInput<TState>): Promise<SimulationResult> {
    const runId = makeRunId(this.scenario.id);
    const windows = await this.#simulateWindows(runId, input);
    const score = windows.reduce(
      (acc, next) => acc + next.checkpoints.reduce((sum, checkpoint) => sum + checkpoint.score, 0),
      0,
    );

    return {
      runId,
      status: windows.at(-1)?.checkpoints.at(-1)?.status ?? 'queued',
      score,
      windows,
      finalPayload: normalize({
        runId,
        tenant: input.tenant,
        phaseCount: timelinePhases.length,
        manifest: this.scenario.manifest?.name,
      }),
    };
  }

  async #simulateWindows<TState extends Record<string, unknown>>(
    runId: ChronicleRunId,
    input: TimelineInput<TState>,
  ): Promise<readonly SimulationWindow[]> {
    const plan = new TimelinePlan(input.tenant, input.blueprint);
    const windows: SimulationWindow[] = [];
    const timeline = toTimelineTuple(input.blueprint.route, 'runtime');

    const base: Omit<ChroniclePhaseInput<TimelineInput<TState>>, 'phase'> = {
      stepId: asChronicleStepId(`base:${runId}`),
      runId,
      tenant: this.scenario.tenant,
      route: input.blueprint.route,
      timeline,
      payload: input,
    };

    for (const phase of timelinePhases) {
      const phaseInput: ChroniclePhaseInput<TimelineInput<TState>> = {
        ...base,
        phase,
      };
      const output = await this.registry.runAll(
        phaseInput,
        {
          id: `${runId}:${phase}` as ChronicleId,
          runId,
          phases: [asChroniclePhase('bootstrap'), asChroniclePhase('execution'), asChroniclePhase('verification')],
          startedAt: Date.now(),
        },
      );

      const checkpoints = plan
        .traversal()
        .map((nodeId, index, all) =>
          this.#composeObservation(output, index, all.length, ['p0', 'p1', 'p2'] as const, nodeId),
        );

      windows.push({
        id: `${runId}:${phase}` as ChronicleId,
        route: input.blueprint.route,
        checkpoints,
      });
    }

    return windows;
  }

  #composeObservation(
    output: ChroniclePhaseOutput<unknown>,
    index: number,
    total: number,
    priorities: readonly ['p0', 'p1', 'p2'],
    nodeId: ChronicleId,
  ): SimulationCheckpoint {
    const weighted = priorities.length + index;
    return {
      timestamp: Date.now(),
      status: output.status,
      score: Math.max(
        0,
        output.score + weighted * 3 - index * (10 / Math.max(total, 1)) + scoreBy(nodeId.length),
      ),
    };
  }

  public static async *streamObservations(
    scenario: ChronicleScenario,
    runId: ChronicleRunId,
  ): AsyncGenerator<ChronicleObservation<SimulationCheckpoint>> {
    for (const phase of timelinePhases) {
      yield {
        id: `${runId}:${phase}` as ChronicleObservation<SimulationCheckpoint>['id'],
        kind: `event:${phase}` as ChronicleObservation<SimulationCheckpoint>['kind'],
        tenant: scenario.tenant,
        runId,
        timestamp: Date.now(),
        source: asChronicleTag('stream'),
        phase: asChroniclePhase(phase),
        route: scenario.route,
        value: {
          timestamp: Date.now(),
          status: 'running',
          score: Math.round(Math.random() * 100),
        },
      };
    }
  }
}

export interface TimelineContext {
  readonly context: ChronicleContext;
  readonly manifest: ChronicleBlueprint['name'];
}

export const enrichTimelineContext = <TState extends Record<string, unknown>>(context: ChronicleContext<TState>): TimelineContext => ({
  context,
  manifest: context.route,
});
