import { RecursiveTupleReverse, type NoInfer } from '@shared/recovery-workbench-runtime';
import { makeRunId, type WorkbenchTenantId, type WorkbenchWorkspaceId } from './ids';
import {
  type WorkbenchCatalog,
  type WorkbenchMetadata,
  type WorkbenchPluginTrace,
  type WorkbenchPhase,
  type WorkbenchRunInput,
  type WorkbenchRunOutput,
  phaseOrder,
} from './models';
import { groupedRoutes, makeRouteMatrix } from './catalog';

type RouteVector<T extends readonly WorkbenchPhase[]> = RecursiveTupleReverse<T>;

export interface PlanInstruction {
  readonly phase: WorkbenchPhase;
  readonly route: `route:${WorkbenchPhase}`;
  readonly expectedStep: number;
}

export interface WorkbenchPlan {
  readonly runId: string;
  readonly tenant: WorkbenchTenantId;
  readonly workspace: WorkbenchWorkspaceId;
  readonly routeOrder: readonly WorkbenchPhase[];
  readonly routeInstructions: readonly PlanInstruction[];
  readonly grouped: ReturnType<typeof groupedRoutes>;
  readonly routePath: RouteVector<readonly WorkbenchPhase[]>;
}

export interface PlanContext {
  readonly requestId: string;
  readonly requestedBy: string;
  readonly routeMatrix: readonly WorkbenchRoute[];
}

const nextRunId = (tenant: string, workspace: string, step: number): string =>
  `${tenant}:${workspace}:plan:${step}:${Date.now()}`;

export const makeRouteOrder = (phases: readonly WorkbenchPhase[]): readonly WorkbenchPhase[] => {
  const normalized = phases.length ? phases : phaseOrder;
  return [...normalized];
};

const routePrefix = (phase: WorkbenchPhase): WorkbenchRoute => `route:${phase}`;

type RouteToken = `route:${WorkbenchPhase}`;
type WorkbenchRoute = RouteToken;

const makeRoutePath = <T extends readonly WorkbenchPhase[]>(phases: T): RouteVector<T> => {
  return [...phases].reverse() as unknown as RouteVector<T>;
};

export const buildPlan = (catalog: WorkbenchCatalog, input: WorkbenchRunInput): WorkbenchPlan => {
  const tenant = input.tenantId;
  const workspace = input.workspaceId;
  const normalized = input.phases.length > 0 ? input.phases : phaseOrder;
  const routeOrder = makeRouteOrder(normalized);
  const tenantKey = String(tenant).replace('tenant:', '');
  const workspaceKey = String(workspace).replace('workspace:', '').replace(`${tenantKey}#`, '');
  const routeInstructions = routeOrder.map((phase, index) => ({
    phase,
    route: routePrefix(phase),
    expectedStep: index,
  }));

  return {
    runId: nextRunId(tenantKey, workspaceKey, routeInstructions.length),
    tenant,
    workspace,
    routeOrder,
    routeInstructions,
    grouped: groupedRoutes(catalog),
    routePath: makeRoutePath(routeOrder),
  };
};

export const executePlanOutput = (
  plan: WorkbenchPlan,
  traces: readonly WorkbenchPluginTrace[],
): WorkbenchRunOutput => {
  const timeline = plan.routeInstructions.map((instruction) => `tick:${instruction.route}:${instruction.expectedStep}`);

  return {
    tenantId: plan.tenant,
    workspaceId: plan.workspace,
    runId: makeRunId(String(plan.tenant).replace('tenant:', ''), String(plan.workspace), String(plan.runId)),
    routeMatrix: makeRouteMatrix({
      tenant: plan.tenant,
      workspace: plan.workspace,
      defaultRoutes: [...plan.routeOrder.map((phase) => routePrefix(phase))],
      plugins: traces.map((trace) => ({
        pluginName: trace.pluginName,
        route: trace.phase,
        routeId: routePrefix(trace.phase),
        confidence: trace.confidence,
        dependencies: [],
        tags: {
          trace: String(trace.latencyMs),
        },
      })),
    }),
    timeline: [...timeline, ...traces.map((trace) => `${trace.route}:${trace.output}`)],
    traces,
    totalDurationMs: Math.max(1, traces.reduce((acc, trace) => acc + trace.latencyMs, 0)),
  };
};

export const isPlanReady = <TMetadata extends WorkbenchMetadata>(
  plan: WorkbenchPlan,
  ctx: PlanContext & { readonly tenant: NoInfer<TMetadata[string]> },
): boolean => {
  return (
    plan.grouped.length > 0 &&
    plan.routeOrder.length > 0 &&
    !!ctx.requestId &&
    ctx.routeMatrix.length > 0 &&
    !!ctx.requestedBy
  );
};
