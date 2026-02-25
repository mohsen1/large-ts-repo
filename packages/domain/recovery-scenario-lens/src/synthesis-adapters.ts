import { ResourceTracker, withAsyncStack } from '@shared/recovery-synthesis-runtime';
import type { NoInfer } from '@shared/type-level';
import {
  asIncidentId,
  asMillis,
  asPercent,
  asPlanCandidateId,
  asScenarioId,
  asScenarioPlanId,
  type ScenarioCommand,
  type ScenarioConstraint,
  type ScenarioPlan,
  type ScenarioReadModel,
  type SimulationResult,
} from './types';
import type {
  SynthesisInput,
  SynthesisRuntimeId,
  SynthesisWorkspace,
  SynthesisWorkspaceEvent,
} from './synthesis-types';

export interface SynthesisArtifactStore {
  save(workspace: SynthesisWorkspace): Promise<void>;
  load(runtimeId: SynthesisRuntimeId): Promise<SynthesisWorkspace | undefined>;
}

export interface SynthesisEventHub {
  publish(event: SynthesisWorkspaceEvent): Promise<void>;
  events(): AsyncIterable<SynthesisWorkspaceEvent>;
  subscribe(listener: (event: SynthesisWorkspaceEvent) => void): void;
}

export interface SynthesisArtifactRegistry {
  appendPlan(plan: ScenarioPlan): Promise<void>;
  appendSimulation(simulation: SimulationResult): Promise<void>;
  readModels(): AsyncIterable<ScenarioReadModel>;
}

export interface SynthesisDependencyContext {
  readonly store: SynthesisArtifactStore;
  readonly hub: SynthesisEventHub;
  readonly catalog: SynthesisArtifactRegistry;
}

export interface InMemorySynthesisStoreState {
  readonly runtimeId: SynthesisRuntimeId;
  readonly workspace: SynthesisWorkspace;
  readonly plans: readonly ScenarioPlan[];
  readonly simulations: readonly SimulationResult[];
}

const toPlanFromPayload = (runtimeId: SynthesisRuntimeId, index: number, payload: SynthesisWorkspace['timeline'][number]): ScenarioPlan => {
  return {
    planId: asScenarioPlanId(`${String(runtimeId)}.plan.${index}`),
    blueprintId: asScenarioId(String(payload.commandOrder[0]?.commandId ?? runtimeId)),
    version: index + 1,
    commandIds: payload.commandOrder.map((command) => command.commandId),
    createdAt: new Date().toISOString(),
    expectedFinishMs: asMillis(payload.commandOrder.length * 1000),
    score: 1 - payload.warnings.length / 10,
    constraints: [] as readonly ScenarioConstraint[],
    warnings: payload.warnings,
  };
};

export class InMemorySynthesisStore implements SynthesisArtifactStore, SynthesisArtifactRegistry {
  readonly #storage = new Map<string, InMemorySynthesisStoreState>();
  readonly #events: SynthesisWorkspaceEvent[] = [];

  async save(workspace: SynthesisWorkspace): Promise<void> {
    const plans = workspace.timeline.map((entry, index) => toPlanFromPayload(workspace.runtimeId, index, entry));
    this.#storage.set(workspace.runtimeId, {
      runtimeId: workspace.runtimeId,
      workspace,
      plans,
      simulations: [],
    });

    for (const event of workspace.events) {
      this.#events.push(event);
    }
  }

  async load(runtimeId: SynthesisRuntimeId): Promise<SynthesisWorkspace | undefined> {
    return this.#storage.get(runtimeId)?.workspace;
  }

  async appendPlan(plan: ScenarioPlan): Promise<void> {
    for (const [runtimeId, state] of this.#storage.entries()) {
      this.#storage.set(runtimeId, {
        ...state,
        plans: [...state.plans, plan],
      });
    }
  }

  async appendSimulation(simulation: SimulationResult): Promise<void> {
    for (const [runtimeId, state] of this.#storage.entries()) {
      this.#storage.set(runtimeId, {
        ...state,
        simulations: [...state.simulations, simulation],
      });
    }
  }

  async *readModels(): AsyncIterable<ScenarioReadModel> {
    for (const state of this.#storage.values()) {
      const planFrame = state.plans.at(-1);
      const candidates = state.plans.map((plan, index) => ({
        candidateId: asPlanCandidateId(`${String(plan.planId)}.${index}`),
        blueprintId: plan.blueprintId,
        orderedCommandIds: plan.commandIds,
        windows: [],
        score: plan.score,
        risk: 0,
        resourceUse: plan.commandIds.length,
      }));

      yield {
        scenarioId: asScenarioId(String(state.workspace.traceId)),
        generatedAt: state.workspace.events.at(-1)?.when ?? new Date().toISOString(),
        metadata: {
          workspaceRuntime: state.runtimeId,
          planCount: state.plans.length,
          simulationCount: state.simulations.length,
        },
        blueprint: {
          scenarioId: asScenarioId(String(state.workspace.traceId)),
          incidentId: asIncidentId(`incident.${String(state.runtimeId)}`),
          name: 'Synthesis Read Model',
          windowMinutes: Math.max(1, state.plans.length * 3),
          baselineConfidence: asPercent(state.plans.length > 0 ? 0.9 : 0.5),
          signals: [],
          commands: state.workspace.timeline.flatMap((entry) => entry.commandOrder),
          links: [],
          policies: ['scenario-lens'],
        },
        candidates,
        activePlan: planFrame,
      };
    }
  }
}

export class EventBusEventHub implements SynthesisEventHub {
  readonly #events: SynthesisWorkspaceEvent[] = [];
  readonly #subscriptions = new Set<(event: SynthesisWorkspaceEvent) => void>();

  async publish(event: SynthesisWorkspaceEvent): Promise<void> {
    this.#events.push(event);
    for (const subscription of this.#subscriptions) {
      subscription(event);
    }
  }

  async *events(): AsyncIterable<SynthesisWorkspaceEvent> {
    for (const event of [...this.#events]) {
      yield event;
    }
  }

  subscribe(listener: (event: SynthesisWorkspaceEvent) => void): void {
    this.#subscriptions.add(listener);
  }
}

export class SynthesisAdapterBundle implements SynthesisDependencyContext {
  readonly #store: SynthesisArtifactStore;
  readonly #hub: SynthesisEventHub;
  readonly #catalog: SynthesisArtifactRegistry;

  constructor(input: Partial<SynthesisDependencyContext> = {}) {
    this.#store = input.store ?? new InMemorySynthesisStore();
    this.#hub = input.hub ?? new EventBusEventHub();
    this.#catalog = input.catalog ?? new InMemorySynthesisStore();
  }

  get store(): SynthesisArtifactStore {
    return this.#store;
  }

  get hub(): SynthesisEventHub {
    return this.#hub;
  }

  get catalog(): SynthesisArtifactRegistry {
    return this.#catalog;
  }
}

export const publishEvent = async (
  hub: SynthesisEventHub,
  input: SynthesisInput,
  message: string,
): Promise<void> => {
  await hub.publish({
    traceId: input.traceId,
    kind: 'govern',
    payload: {
      message,
      profile: input.profile.profileId,
    },
    when: new Date().toISOString(),
  });
};

export const withSynthesisAdapters = async <T>(
  input: NoInfer<SynthesisDependencyContext>,
  callback: (dependencies: NoInfer<SynthesisDependencyContext>) => Promise<T>,
): Promise<T> => {
  const bundle = new ResourceTracker(input);

  return await withAsyncStack(async () => {
    try {
      return await callback(bundle.current);
    } finally {
      await bundle[Symbol.asyncDispose]();
    }
  });
};
