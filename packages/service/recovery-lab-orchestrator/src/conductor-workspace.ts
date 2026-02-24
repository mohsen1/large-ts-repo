import { buildCompositeForecast, type ForecastSummary, buildForecastSummary, type SurfaceSignal } from '@domain/recovery-simulation-lab-core';
import { ConductorAnalytics, buildConductorAnalytics } from './conductor-analytics';
import type { LabExecution, LabExecutionResult, LabLane, LabPlanTemplate, LabScenario, LatticeNodeId } from '@domain/recovery-simulation-lab-core';
import { buildLatticeFromScenarios, summarizeSignalRoutes } from '@domain/recovery-simulation-lab-core';
import { asLabTenantId } from '@shared/recovery-lab-kernel';
import { createDisposableScope, type LabTenantId } from '@shared/recovery-lab-kernel';
import { withBrand, type Brand } from '@shared/core';
import { type LabScenario as LabScenarioModel, toWorkflowTag } from '@domain/recovery-simulation-lab-core';
import {
  LabConductorRegistry,
  buildConductorRegistry,
  mapScenarioSignals,
  planRouteFromScenario,
  summarizeRegistryOutput,
} from './conductor-registry';

export type WorkspaceType = Brand<string, 'WorkspaceType'>;
export type WorkspaceScope = Brand<string, 'WorkspaceScope'>;

export interface WorkspaceDefinition {
  readonly tenant: string;
  readonly workspace: string;
  readonly lanes: readonly LabLane[];
  readonly scenarios: readonly LabScenarioModel[];
  readonly planTemplates: readonly LabPlanTemplate[];
}

export interface WorkspaceSnapshot {
  readonly workspace: string;
  readonly tenant: string;
  readonly planCount: number;
  readonly scenarioCount: number;
  readonly routeCount: number;
  readonly signalCount: number;
  readonly score: number;
  readonly topRoutes: readonly string[];
}

export interface WorkspaceExecution {
  readonly executionId: string;
  readonly tenant: LabTenantId;
  readonly pluginCount: number;
  readonly lane: LabLane;
  readonly laneOrder: readonly LabLane[];
}

export interface ConductorDashboardSummary {
  readonly workspace: string;
  readonly tenant: string;
  readonly routeCount: number;
  readonly scenarioCount: number;
  readonly score: number;
  readonly summaries: readonly string[];
  readonly top: readonly string[];
  readonly topSignals: readonly [string, number][];
  readonly metrics: {
    readonly lanes: readonly LabLane[];
    readonly top: readonly string[];
  };
}

export interface ConductorAnalyticsRun {
  readonly runId: string;
  readonly workspace: string;
  readonly laneOrder: readonly LabLane[];
  readonly status: 'ok' | 'warn' | 'fail';
  readonly trace: readonly string[];
  readonly routeCount: number;
  readonly routeSummary: readonly { readonly tenant: string; readonly route: string; readonly score: number }[];
}

const makeWorkspaceScope = (tenant: string, workspace: string): WorkspaceScope => {
  return withBrand(`workspace:${tenant}:${workspace}`, 'WorkspaceScope');
};

const buildWorkspaceType = (tenant: string): WorkspaceType => {
  return withBrand(`workspace-type:${tenant}`, 'WorkspaceType');
};

const defaultLanes = ['ingest', 'simulate', 'restore', 'verify', 'report'] as const satisfies readonly LabLane[];

export class ConductorWorkspace {
  readonly #analytics: ConductorAnalytics;
  readonly #registry: LabConductorRegistry;
  readonly #scope: WorkspaceScope;
  readonly #type: WorkspaceType;
  #lastSummary: ForecastSummary | null = null;

  public constructor(readonly definition: WorkspaceDefinition) {
    this.#analytics = buildConductorAnalytics(definition.tenant);
    this.#registry = buildConductorRegistry(definition.tenant, 'adaptive');
    this.#scope = makeWorkspaceScope(definition.tenant, definition.workspace);
    this.#type = buildWorkspaceType(definition.tenant);
  }

  public async bootstrap(): Promise<WorkspaceSnapshot> {
    await using _scope = createDisposableScope();
    void _scope;
    await this.#ingestPlans();
    const summary = buildForecastSummary(this.definition.tenant, this.definition.scenarios, this.definition.planTemplates);
    this.#lastSummary = summary;
    return this.snapshot();
  }

  public async executeScenario(scenarioId: string, execution: { readonly executionId: string; readonly tenant: LabTenantId }): Promise<ConductorAnalyticsRun> {
    const scenario = this.ensureScenario(scenarioId);
    const lattice = buildLatticeFromScenarios(scenario, this.definition.planTemplates);
    const routeSummary = summarizeSignalRoutes(this.definition.scenarios, this.definition.planTemplates);

    return {
      runId: `${execution.executionId}`,
      workspace: this.#scope,
      laneOrder: defaultLanes,
      status: 'ok',
      trace: routeSummary.map((entry) => entry.route),
      routeCount: lattice.buildRoutes().length,
      routeSummary,
    };
  }

  public async analyzeResult(result: LabExecutionResult): Promise<ForecastSummary> {
    const trace = await this.#analytics.enrichResult(result);
    const summary = await this.#analytics.mergeTraces([trace]);
    return summary;
  }

  public async runSummary(): Promise<ConductorDashboardSummary> {
    const summary = await this.#analytics.summarize(this.definition.scenarios, this.definition.planTemplates);
    const routeSignals = collectCompositeSignals(this.definition.scenarios);

    return {
      workspace: `${this.#scope}`,
      tenant: `${this.definition.tenant}`,
      routeCount: this.definition.planTemplates.length,
      scenarioCount: this.definition.scenarios.length,
      score: summary.score,
      summaries: summary.summaries,
      top: summary.topSignals.map(([route]) => route).slice(0, 20),
      topSignals: summary.topSignals,
      metrics: {
        lanes: summarizeLanes(this.definition.scenarios),
        top: routeSignals.map(([route]) => route).slice(0, 20),
      },
    };
  }

  public registerDefaultPlugins(): void {
    for (const plan of this.definition.planTemplates) {
      const lane: LabLane = plan.canary ? 'verify' : 'simulate';
      this.#registry.register({
        id: `${plan.scenarioId}`,
        label: `${this.definition.tenant}:plugin`,
        lane,
        tags: [toWorkflowTag(lane)],
        requires: [plan.scenarioId],
        config: {
          planId: `${plan.scenarioId}`,
          source: `${this.#type}`,
        },
        run: async (_input, _context) => ({
          executedBy: `${this.#type}`,
          checkedAt: Date.now(),
        }),
      });
    }

    void summarizeRegistryOutput(this.#registry);

    const signalSignals = this.definition.scenarios
      .flatMap((scenario) => [...mapScenarioSignals(scenario).values()])
      .flat();

    const runPromises = signalSignals.map((signal) =>
        this.#registry
        .run(this.#registry.byLane(signal.lane).map((entry) => `${entry.id}:${entry.label}`), {
          signalCount: signal.value,
        }, {
          tenant: this.definition.tenant,
          workspace: this.definition.workspace,
          stage: `${signal.lane}`,
          tags: ['registry:plugin'],
          tenantId: asLabTenantId(this.definition.tenant),
        })
        .then((result) => result.output)
        .catch(() => null),
      );

    void Promise.all(runPromises);
  }

  public snapshot(): WorkspaceSnapshot {
    const routeCount = this.definition.planTemplates.length * Math.max(1, this.definition.scenarios.length);
    const signalCount = this.definition.scenarios.reduce((acc, scenario) => acc + scenario.signals.length, 0);

    return {
      workspace: this.definition.workspace,
      tenant: this.definition.tenant,
      planCount: this.definition.planTemplates.length,
      scenarioCount: this.definition.scenarios.length,
      routeCount,
      signalCount,
      score: Math.max(0, Math.min(1, signalCount / Math.max(1, routeCount))),
      topRoutes: this.definition.planTemplates.map((plan) => plan.scenarioId),
    };
  }

  public dispose(): void {
    this.#registry[Symbol.dispose]();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.#registry[Symbol.asyncDispose]();
  }

  public async compositeForecast(signals: readonly SurfaceSignal[]): Promise<ForecastSummary> {
    return this.#analytics.fromPlan(this.definition.tenant, signals, this.definition.planTemplates);
  }

  public workspaceScope(): WorkspaceScope {
    return this.#scope;
  }

  private ensureScenario(scenarioId: string): LabScenarioModel {
    const found = this.definition.scenarios.find((entry) => `${entry.scenarioId}` === scenarioId);
    if (!found) {
      throw new Error(`scenario-not-found:${scenarioId}`);
    }
    return found;
  }

  async #ingestPlans(): Promise<void> {
    this.registerDefaultPlugins();

    for (const plan of this.definition.planTemplates) {
      const route = planRouteFromScenario(this.ensureScenario(`${plan.scenarioId}`));
      void route;
      const lattice = buildLatticeFromScenarios(this.ensureScenario(`${plan.scenarioId}`), [plan]);
      void lattice.buildManifest();
    }
  }
}

export const createWorkspace = (tenant: string, workspace: string, lane: LabLane): ConductorWorkspace => {
  return new ConductorWorkspace({
    tenant,
    workspace,
    lanes: [lane, ...defaultLanes],
    scenarios: [],
    planTemplates: [],
  });
};

export const evaluateWorkspace = async (
  tenant: string,
  workspace: string,
  scenarios: readonly LabScenarioModel[],
  plans: readonly LabPlanTemplate[],
): Promise<ConductorDashboardSummary> => {
  const orchestrator = new ConductorWorkspace({
    tenant,
    workspace,
    lanes: defaultLanes,
    scenarios,
    planTemplates: plans,
  });
  const updated = await orchestrator.bootstrap();
  const summary = await orchestrator.runSummary();

  return {
    ...summary,
    routeCount: updated.routeCount,
    scenarioCount: updated.scenarioCount,
  };
};

export const collectNodeIds = (ids: readonly LatticeNodeId[]): readonly string[] => {
  return ids.map((id) => `${id}`);
};

const collectCompositeSignals = (scenarios: readonly LabScenarioModel[]): readonly [string, number][] => {
  return scenarios
    .flatMap((scenario) => scenario.signals)
    .map((signal) => [signal.name, signal.value] as [string, number]);
};

const summarizeLanes = (scenarios: readonly LabScenarioModel[]): readonly LabLane[] => {
  return [...new Set(scenarios.flatMap((scenario) => scenario.signals.map((signal) => signal.lane)))];
};

const makeCompositeScore = (left: number, right: number): number => (left * 0.4 + right * 0.6) / 100;

export const combineWorkspace = (
  left: WorkspaceSnapshot,
  right: WorkspaceSnapshot,
): WorkspaceSnapshot => ({
  ...left,
  routeCount: left.routeCount + right.routeCount,
  scenarioCount: left.scenarioCount + right.scenarioCount,
  signalCount: left.signalCount + right.signalCount,
  score: makeCompositeScore(left.score, right.score),
  topRoutes: [...left.topRoutes, ...right.topRoutes].toSorted(),
  tenant: `${left.tenant},${right.tenant}`,
  workspace: `${left.workspace}-${right.workspace}`,
});
