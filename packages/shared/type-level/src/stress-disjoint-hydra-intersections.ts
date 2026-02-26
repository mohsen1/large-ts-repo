export interface HydraAxiom {
  readonly axiomId: string;
  readonly enabled: boolean;
}

export interface HydraTrace {
  readonly traceKey: string;
  readonly steps: readonly string[];
}

export interface HydraShape {
  readonly shape: 'mesh' | 'star' | 'ring' | 'mesh-plus';
  readonly radius: number;
}

export interface HydraPolicy {
  readonly policyCode: string;
  readonly priority: 0 | 1 | 2 | 3;
}

export interface HydraBudget {
  readonly budgetId: string;
  readonly budgetUsd: number;
}

export interface HydraEnvelope {
  readonly envelope: string;
  readonly createdAt: number;
}

export interface HydraSignal {
  readonly signalId: string;
  readonly healthy: boolean;
}

export interface HydraTelemetry {
  readonly telemetryMode: 'sync' | 'async';
  readonly endpoint: string;
}

export interface HydraDecision {
  readonly decisionId: string;
  readonly approved: boolean;
}

export interface HydraMeta {
  readonly owner: string;
  readonly version: `v${number}`;
}

export interface HydraRouteTag {
  readonly routeTag: string;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface HydraPlan {
  readonly planId: string;
  readonly steps: readonly number[];
}

export type HydratedIntersectionInput =
  | { kind: 'core'; axiom: HydraAxiom; trace: HydraTrace; shape: HydraShape }
  | { kind: 'policy'; policy: HydraPolicy; budget: HydraBudget; envelope: HydraEnvelope }
  | { kind: 'runtime'; telemetry: HydraTelemetry; signal: HydraSignal; decision: HydraDecision }
  | { kind: 'meta'; meta: HydraMeta; route: HydraRouteTag; plan: HydraPlan };

export type CoreIntersection = HydraAxiom & HydraTrace & HydraShape;
export type PolicyIntersection = HydraPolicy & HydraBudget & HydraEnvelope;
export type RuntimeIntersection = HydraTelemetry & HydraSignal & HydraDecision;
export type MetaIntersection = HydraMeta & HydraRouteTag & HydraPlan;

export type HydraCatalogByKind<T extends HydratedIntersectionInput['kind']> = T extends 'core'
  ? CoreIntersection
  : T extends 'policy'
    ? PolicyIntersection
    : T extends 'runtime'
      ? RuntimeIntersection
      : MetaIntersection;

export type DisjointIntersectionTuple = readonly [CoreIntersection, PolicyIntersection, RuntimeIntersection, MetaIntersection];

export type PickHydraField<T, K> = T extends { [key in K & string]: infer Value } ? Value : never;

export type MapHydraIntersection<T extends HydratedIntersectionInput> =
  T['kind'] extends 'core'
    ? CoreIntersection
    : T['kind'] extends 'policy'
      ? PolicyIntersection
      : T['kind'] extends 'runtime'
        ? RuntimeIntersection
        : MetaIntersection;

export type HydraResultByInput<T extends readonly HydratedIntersectionInput[]> = {
  readonly [K in keyof T]: MapHydraIntersection<T[K]>;
};

export const composeHydraIntersection = <T extends HydratedIntersectionInput>(input: T): MapHydraIntersection<T> => {
  switch (input.kind) {
    case 'core':
      return {
        axiomId: input.axiom.axiomId,
        enabled: input.axiom.enabled,
        traceKey: input.trace.traceKey,
        steps: input.trace.steps,
        shape: input.shape.shape,
        radius: input.shape.radius,
      } as MapHydraIntersection<T>;
    case 'policy':
      return {
        policyCode: input.policy.policyCode,
        priority: input.policy.priority,
        budgetId: input.budget.budgetId,
        budgetUsd: input.budget.budgetUsd,
        envelope: input.envelope.envelope,
        createdAt: input.envelope.createdAt,
      } as MapHydraIntersection<T>;
    case 'runtime':
      return {
        telemetryMode: input.telemetry.telemetryMode,
        endpoint: input.telemetry.endpoint,
        signalId: input.signal.signalId,
        healthy: input.signal.healthy,
        decisionId: input.decision.decisionId,
        approved: input.decision.approved,
      } as MapHydraIntersection<T>;
    case 'meta':
      return {
        owner: input.meta.owner,
        version: input.meta.version,
        routeTag: input.route.routeTag,
        severity: input.route.severity,
        planId: input.plan.planId,
        steps: input.plan.steps,
      } as MapHydraIntersection<T>;
  }
};

export const hydrateHydraCatalog = <T extends readonly HydratedIntersectionInput[]>(inputs: T): HydraResultByInput<T> => {
  const results = inputs.map((input) => composeHydraIntersection(input)) as HydraResultByInput<T>;
  return results;
};

export const hydraBlueprints = [
  {
    kind: 'core',
    axiom: { axiomId: 'ax-01', enabled: true },
    trace: { traceKey: 'trace-core-01', steps: ['a', 'b', 'c'] },
    shape: { shape: 'mesh', radius: 9 },
  },
  {
    kind: 'policy',
    policy: { policyCode: 'pl-01', priority: 2 },
    budget: { budgetId: 'bd-01', budgetUsd: 100000 },
    envelope: { envelope: 'policy', createdAt: Date.now() },
  },
  {
    kind: 'runtime',
    telemetry: { telemetryMode: 'async', endpoint: '/runtime/trace' },
    signal: { signalId: 'sig-01', healthy: true },
    decision: { decisionId: 'dec-01', approved: false },
  },
  {
    kind: 'meta',
    meta: { owner: 'platform', version: 'v3' },
    route: { routeTag: '/ops/dispatch/high', severity: 'high' },
    plan: { planId: 'plan-01', steps: [1, 2, 3, 5, 8, 13] },
  },
] as const satisfies readonly HydratedIntersectionInput[];

export const runHydraCatalog = () => {
  const output = hydrateHydraCatalog(hydraBlueprints);
  const byKind: Record<string, number> = {
    core: 0,
    policy: 0,
    runtime: 0,
    meta: 0,
  };

  for (const item of hydraBlueprints) {
    byKind[item.kind] += 1;
  }

  return { output, byKind };
};

export const readHydraIntersectionField = <T extends HydratedIntersectionInput>(
  entry: T,
): unknown[] => {
  const value = composeHydraIntersection(entry);
  const keys = Object.keys(value) as Array<keyof MapHydraIntersection<T>>;
  return keys.map((key) => value[key as never] as unknown);
};
