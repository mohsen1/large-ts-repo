import {
  asPlanCandidateId,
  asMillis,
  asPercent,
  asScenarioId,
  asScenarioPlanId,
  type ScenarioPlan,
  type ScenarioReadModel,
  type SimulationResult,
} from './types';
import { collectIterable } from '@shared/recovery-synthesis-runtime';
import {
  EventBusEventHub,
  InMemorySynthesisStore,
  type SynthesisArtifactRegistry,
  type SynthesisArtifactStore,
  type SynthesisDependencyContext,
  type SynthesisEventHub,
} from './synthesis-adapters';
import {
  type SynthesisInput,
  type SynthesisSimulationSnapshot,
  type SynthesisWorkspace,
  type SynthesisWorkspaceEvent,
} from './synthesis-types';
import { createSynthesis } from './synthesis-runtime';

interface WorkspaceServiceDeps {
  readonly store?: SynthesisArtifactStore;
  readonly hub?: SynthesisEventHub;
  readonly catalog?: SynthesisArtifactRegistry;
}

export interface WorkspaceRunResult {
  readonly workspace: SynthesisWorkspace;
  readonly output: SynthesisSimulationSnapshot;
  readonly commandTimelineCount: number;
}

export interface WorkspaceSnapshot {
  readonly workspace: SynthesisWorkspace;
  readonly planCandidates: number;
  readonly timelineEntries: number;
}

export class SynthesisWorkspaceService {
  readonly #runtime = createSynthesis({ runtimeId: 'recovery-scenario-lens', labels: { tenant: 'recovery' } });
  readonly #store: SynthesisArtifactStore;
  readonly #hub: SynthesisEventHub;
  readonly #catalog: SynthesisArtifactRegistry;

  constructor(_runtimeId: string, dependencies: WorkspaceServiceDeps = {}) {
    const bundle = this.resolveDependencies(dependencies);
    this.#store = bundle.store;
    this.#hub = bundle.hub;
    this.#catalog = bundle.catalog;
  }

  async run(input: SynthesisInput): Promise<WorkspaceRunResult> {
    const runtimeResult = await this.#runtime.execute(input);
    const workspace = this.ensureOutput(runtimeResult.workspace);
    const output = workspace.latestOutput ?? this.syntheticOutput(input);

    await this.#store.save(workspace);
    await this.#hub.publish(this.toStoreEvent(workspace));

    return {
      workspace,
      output,
      commandTimelineCount: output.commandTimeline.length,
    };
  }

  async publishPlan(plan: ScenarioPlan): Promise<void> {
    await this.#catalog.appendPlan(plan);
    await this.#hub.publish({
      traceId: plan.planId as unknown as SynthesisWorkspace['traceId'],
      kind: 'publish',
      payload: { planId: plan.planId },
      when: new Date().toISOString(),
    });
  }

  async publishSimulation(simulation: SimulationResult): Promise<void> {
    await this.#catalog.appendSimulation(simulation);
    await this.#hub.publish({
      traceId: simulation.scenarioId as unknown as SynthesisWorkspace['traceId'],
      kind: 'simulate',
      payload: { simulationId: simulation.simulationId, riskScore: simulation.riskScore },
      when: new Date().toISOString(),
    });
  }

  async snapshot(): Promise<WorkspaceSnapshot> {
    const readModels: ScenarioReadModel[] = [];
    for await (const model of this.#catalog.readModels()) {
      readModels.push(model);
    }

    return {
      workspace: await this.snapshotWorkspace(readModels),
      planCandidates: readModels.reduce((count, model) => count + model.candidates.length, 0),
      timelineEntries: readModels.reduce((count, model) => count + model.candidates.length + Number(!!model.activePlan), 0),
    };
  }

  private async snapshotWorkspace(readModels: readonly ScenarioReadModel[]): Promise<SynthesisWorkspace> {
    const latest = readModels.at(-1);
    const runtimeId = latest?.metadata.workspaceRuntime as unknown as string;

    return {
      runtimeId: runtimeId as SynthesisWorkspace['runtimeId'],
      traceId: latest ? (latest.scenarioId as unknown as SynthesisWorkspace['traceId']) : ('trace.fallback' as SynthesisWorkspace['traceId']),
      events: latest?.candidates.length
        ? latest.candidates.map((candidate, index): SynthesisWorkspaceEvent => ({
            traceId: latest.scenarioId as unknown as SynthesisWorkspace['traceId'],
            kind: 'plan',
            payload: { candidateId: candidate.candidateId, index },
            when: new Date().toISOString(),
          }))
        : [],
      timeline: latest
        ? [
            {
              source: 'governed',
              commandOrder: latest.candidates.flatMap((candidate) =>
                candidate.orderedCommandIds.map((commandId) => ({
                  commandId,
                  commandName: `candidate-command-${commandId}`,
                  targetService: 'recovery',
                  estimatedDurationMs: asMillis(1000),
                  resourceSpendUnits: 1,
                  prerequisites: [],
                  blastRadius: 0,
                })),
              ),
              warnings: latest.candidates.reduce<string[]>(
                (all, candidate) => [...all, ...candidate.windows.flatMap(() => ['candidate window'])],
                [],
              ),
            },
          ]
        : [],
    };
  }

  private ensureOutput(workspace: SynthesisWorkspace): SynthesisWorkspace {
    if (workspace.latestOutput) {
      return workspace;
    }

    const timelineItem = workspace.timeline.at(-1);
    const commandOrder = timelineItem?.commandOrder ?? [];

    return {
      ...workspace,
      latestOutput: {
        traceId: workspace.traceId,
        generatedAt: new Date().toISOString(),
        commandTimeline: commandOrder.map((command, index) => ({
          commandId: command.commandId,
          stage: `stage:${index}` as const,
        })),
        plan: {
          planId: asScenarioPlanId(`fallback.plan.${workspace.runtimeId}`),
          blueprintId: asScenarioId(workspace.traceId as unknown as string),
          version: 1,
          commandIds: commandOrder.map((command) => command.commandId),
          createdAt: new Date().toISOString(),
          expectedFinishMs: asMillis(Math.max(1, commandOrder.length * 1000)),
          score: 0.5,
          constraints: [],
          warnings: timelineItem?.warnings ?? [],
        },
        readModel: {
          scenarioId: asScenarioId(workspace.traceId as unknown as string),
          generatedAt: new Date().toISOString(),
          metadata: {
            workspaceRuntime: workspace.runtimeId,
          },
          blueprint: {
            scenarioId: asScenarioId(workspace.traceId as unknown as string),
            incidentId: `incident.${workspace.runtimeId}` as ScenarioReadModel['scenarioId'] & { readonly __brand: 'IncidentId' },
            name: 'Synthesis Workspace',
            windowMinutes: Math.max(1, commandOrder.length),
            baselineConfidence: asPercent(0.8),
            signals: [],
            commands: commandOrder,
            links: [],
            policies: [],
          },
          candidates: [
            {
              candidateId: asPlanCandidateId(`candidate.${workspace.traceId as unknown as string}`),
              blueprintId: asScenarioId(workspace.traceId as unknown as string),
              orderedCommandIds: commandOrder.map((command) => command.commandId),
              windows: [],
              score: 0.7,
              risk: 0,
              resourceUse: commandOrder.length,
            },
          ],
        },
      } as SynthesisWorkspace['latestOutput'],
    };
  }

  private syntheticOutput(input: SynthesisInput): SynthesisSimulationSnapshot {
    return {
      traceId: input.traceId,
      generatedAt: new Date().toISOString(),
      commandTimeline: input.blueprint.commands.map((command, index) => ({
        commandId: command.commandId,
        stage: `stage:${index}` as const,
      })),
      plan: {
        planId: asScenarioPlanId(`fallback.plan.${input.blueprint.scenarioId}`),
        blueprintId: input.blueprint.scenarioId,
        version: 1,
        commandIds: input.blueprint.commands.map((command) => command.commandId),
        createdAt: new Date().toISOString(),
        expectedFinishMs: asMillis(Math.max(1, input.blueprint.commands.length * 1000)),
        score: 1,
        constraints: [],
        warnings: [],
      },
      readModel: {
        scenarioId: input.blueprint.scenarioId,
        generatedAt: new Date().toISOString(),
        metadata: {
          workspaceRuntime: input.traceId,
        },
        blueprint: input.blueprint,
        candidates: [],
      },
    };
  }

  private toStoreEvent(workspace: SynthesisWorkspace): SynthesisWorkspaceEvent {
    return {
      traceId: workspace.traceId,
      kind: 'store',
      payload: {
        runtimeId: workspace.runtimeId,
        timelineLength: workspace.timeline.length,
      },
      when: new Date().toISOString(),
    };
  }

  private resolveDependencies(dependencies: WorkspaceServiceDeps): SynthesisDependencyContext {
    return {
      store: dependencies.store ?? new InMemorySynthesisStore(),
      hub: dependencies.hub ?? new EventBusEventHub(),
      catalog: dependencies.catalog ?? new InMemorySynthesisStore(),
    };
  }
}
