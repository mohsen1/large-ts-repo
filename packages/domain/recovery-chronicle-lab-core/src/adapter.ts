import {
  asChronicleRoute,
  asChronicleTag,
  asChronicleTenantId,
  type ChronicleRoute,
  type ChroniclePluginDescriptor,
  defaultRouteSamples,
} from '@shared/chronicle-orchestration-protocol';
import { makePlan, planFromSimulation, makeWorkspace } from './planner';
import { initialContext, type PlannerInput, type PlannerOutput } from './models';
import type { RunGoal, SimulationInput, SimulationOutput, InsightRecord } from './models';
import { simulateSession, simulateAndRender, simulateWithPluginOrder } from './simulation';
import { buildInsightBuckets, deriveInsights } from './insights';

export interface AdapterFacade {
  readonly createPlan: (input: PlannerInput) => PlannerOutput;
  readonly runSimulation: (input: SimulationInput, plugins: readonly ChroniclePluginDescriptor[]) => Promise<SimulationOutput>;
  readonly runSimulationLog: (
    input: SimulationInput,
    plugins: readonly ChroniclePluginDescriptor[],
  ) => Promise<readonly string[]>;
  readonly runSimulationSorted: (
    input: SimulationInput,
    plugins: readonly ChroniclePluginDescriptor[],
  ) => Promise<SimulationOutput>;
  readonly runFromTemplate: (
    tenant: string,
    route: string,
    goal: RunGoal,
    plugins: readonly ChroniclePluginDescriptor[],
  ) => Promise<readonly InsightRecord[]>;
}

export interface ApiContract {
  readonly id: string;
  readonly route: ChronicleRoute;
  readonly endpoint: string;
}

const defaultGoal: RunGoal = {
  kind: 'maximize-coverage',
  target: 92,
};

const toContract = (route: ChronicleRoute): ApiContract => ({
  id: `contract:${route}`,
  route,
  endpoint: `/api/chronicle/${route}`,
});

export const createLabAdapter = (tenant: string): AdapterFacade => {
  const tenantRoute = defaultRouteSamples[tenant.length % defaultRouteSamples.length] ?? asChronicleRoute('studio');
  const routeContract = toContract(asChronicleRoute(tenantRoute));

  return {
    createPlan: (input) => makePlan(input),
    runSimulation: async (input, plugins) => simulateWithPluginOrder(input, plugins),
    runSimulationLog: async (input, plugins) => simulateAndRender(input, plugins),
    runSimulationSorted: async (input, plugins) => {
      const ordered = [...plugins].toSorted((left, right) => left.name.localeCompare(right.name));
      return simulateSession(input, ordered);
    },
    runFromTemplate: async (tenantId, route, goal, plugins) => {
      const routeId = asChronicleRoute(route);
      const input: SimulationInput = {
        tenant: asChronicleTenantId(tenantId),
        route: routeId,
        goal,
        limit: 4,
      };
      const simulation = await simulateSession(input, plugins);
      const insights = deriveInsights([simulation]);
      const _buckets = buildInsightBuckets(insights);
      void routeContract;
      return insights;
    },
  };
};

export const workspaceFromContract = (contract: ApiContract): { route: ChronicleRoute; tenant: string } => ({
  route: contract.route,
  tenant: String(contract.id),
});

export const buildFromContract = async (
  contract: ApiContract,
  plugins: readonly ChroniclePluginDescriptor[],
): Promise<SimulationOutput> => {
  const workspace = makeWorkspace({
    tenant: contract.id,
    route: String(contract.route),
    phases: ['phase:boot', 'phase:signal', 'phase:policy', 'phase:verify'],
    plugins,
    goal: defaultGoal,
    limit: 4,
  });

  const plan = makePlan({
    tenant: contract.id,
    route: String(contract.route),
    phases: ['phase:boot', 'phase:signal', 'phase:policy', 'phase:verify'],
    plugins: workspace.pluginCatalog.plugins,
    goal: defaultGoal,
    limit: 3,
  });

  const simulationInput: SimulationInput = {
    tenant: plan.context.tenant,
    route: plan.context.route,
    goal: defaultGoal,
    limit: 3,
  };

  return simulateSession(simulationInput, plan.plugins.plugins);
};

export const runFallback = async (
  tenant: string,
  route: string,
  plugins: readonly ChroniclePluginDescriptor[],
): Promise<string[]> => {
  const context = initialContext(tenant, route);
  const workspace = planFromSimulation(
    {
      tenant: context.tenant,
      route: context.route,
      limit: 2,
      goal: defaultGoal,
    },
    plugins,
  );

  const simulation = await simulateSession(
    {
      tenant: workspace.context.tenant,
      route: workspace.context.route,
      goal: defaultGoal,
      limit: 2,
  },
    workspace.plugins.plugins,
  );

  return simulation.events.map((entry) => `${entry.phase}: ${entry.status}`);
};

export const asChronicleTenantTag = asChronicleTag;
