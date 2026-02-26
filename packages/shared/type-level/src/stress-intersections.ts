export type WidgetA = {
  readonly id: `widget-${string}`;
  readonly mode: 'ingest' | 'simulate' | 'reconcile';
  readonly rank: 1;
  readonly flags: { readonly strict: true; readonly active: boolean };
};

export type WidgetB = {
  readonly id: `widget-${string}`;
  readonly mode: 'materialize' | 'restore' | 'dispatch';
  readonly rank: 2;
  readonly path: `/${string}`;
  readonly tags: readonly string[];
};

export type WidgetC = {
  readonly correlation: `corr-${number}`;
  readonly domain: 'mesh' | 'workload' | 'policy';
  readonly rank: 3;
  readonly tags: readonly string[];
};

export type WidgetD = {
  readonly id: `widget-${string}`;
  readonly mode: 'audit' | 'telemetry' | 'observe';
  readonly rank: 4;
  readonly metrics: { readonly value: number; readonly scale: 'high' | 'low' };
};

export type WidgetE = {
  readonly tags: {
    readonly group: 'incident' | 'signal';
    readonly confidence: number;
  };
  readonly mode: 'stabilize' | 'drill' | 'floodfill';
  readonly rank: 5;
  readonly notes?: string;
};

export type WidgetF = {
  readonly state: 'ready' | 'running' | 'complete';
  readonly rank: 6;
  readonly trace: {
    readonly source: string;
    readonly target: string;
    readonly active: boolean;
  };
};

export type WidgetG = {
  readonly id: `widget-${string}`;
  readonly mode: 'isolate' | 'reroute' | 'throttle';
  readonly rank: 7;
  readonly budget: number;
};

export type WidgetH = {
  readonly metrics: { readonly score: number; readonly variance: number };
  readonly rank: 8;
  readonly state: 'observed' | 'triaged';
};

export type WidgetI = {
  readonly timeline: readonly { readonly at: number; readonly op: string }[];
  readonly rank: 9;
  readonly severity: 'low' | 'medium' | 'high';
};

export type WidgetJ = {
  readonly id: `widget-${string}`;
  readonly mode: 'policy-reset' | 'resource-scan' | 'state-rollback';
  readonly rank: 10;
  readonly active: true;
};

export type WidgetK = {
  readonly confidence: { readonly a: number; readonly b: number; readonly c: number };
  readonly rank: 11;
  readonly traceId: `trace-${string}`;
};

export type WidgetL = {
  readonly schedule: readonly { readonly ts: number; readonly phase: string }[];
  readonly rank: 12;
};

export type WidgetM = {
  readonly profile: { readonly owner: string; readonly zone: string };
  readonly rank: 13;
};

export type WidgetN = {
  readonly metrics: { readonly errorRate: number; readonly latency: number };
  readonly rank: 14;
  readonly tags: readonly string[];
};

export type WidgetO = {
  readonly command: `cmd-${string}`;
  readonly mode: 'route-fallback' | 'topology-drift' | 'signal-reconcile';
  readonly rank: 15;
};

export type WidgetP = {
  readonly flags: { readonly canary: boolean; readonly gated: boolean };
  readonly rank: 16;
  readonly audit: {
    readonly at: number;
    readonly owner: string;
  };
};

export type WidgetQ = {
  readonly id: `widget-${string}`;
  readonly mode: 'policy-enforce' | 'load-shed' | 'audit-trace';
  readonly rank: 17;
  readonly checksum: `sum-${number}`;
};

export type WidgetR = {
  readonly schedule: readonly string[];
  readonly rank: 18;
};

export type WidgetS = {
  readonly signal: { readonly kind: string; readonly payload: unknown };
  readonly rank: 19;
};

export type WidgetT = {
  readonly id: `widget-${string}`;
  readonly mode: 'mesh-check' | 'policy-rewrite' | 'signal-triage';
  readonly rank: 20;
};

export type WidgetU = {
  readonly bounds: readonly [number, number, number, number];
  readonly rank: 21;
};

export type WidgetV = {
  readonly budget: { readonly floor: number; readonly ceil: number };
  readonly rank: 22;
};

export type WidgetW = {
  readonly route: `/${string}/${string}`;
  readonly mode: 'workload-balance' | 'safety-guard' | 'latency-loop';
  readonly rank: 23;
};

export type WidgetX = {
  readonly source: 'agent' | 'signal' | 'planner';
  readonly mode: 'node-recover' | 'route-fallback' | 'topology-drift';
  readonly rank: 24;
};

export type WidgetY = {
  readonly trace: { readonly a: string; readonly b: string; readonly c: string };
  readonly rank: 25;
};

export type WidgetZ = {
  readonly profile: { readonly env: string; readonly region: string; readonly team: string };
  readonly mode: 'observe' | 'drill' | 'audit';
  readonly rank: 26;
};

export type MassiveIntersection = WidgetA & WidgetF;

export type FlattenedWidget<T> = T extends { readonly id?: infer Id; readonly route?: infer Route }
  ? { id: Id; route: Route }
  : T;

export type MergeWidgets<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? FlattenedWidget<Head & MergeWidgets<Tail>>
  : {};

export type WidgetBundle = WidgetA & WidgetF;

type CollapseIntersection<T> = T extends { [K in keyof T]: T[K] } ? T : never;

export type ReifiedIntersection = MassiveIntersection;
export type BundleProjection = WidgetBundle;

export const composeIntersection = <T extends readonly Record<string, unknown>[]>(
  layers: T,
): MergeWidgets<T> => {
  const out = {} as MergeWidgets<T>;
  for (const layer of layers) {
    Object.assign(out, layer);
  }
  return out;
};

export const defaultBundle = composeIntersection([
  {
    id: 'widget-latest',
    mode: 'ingest',
    rank: 1,
    flags: { strict: true, active: true },
  },
  { id: 'widget-latest', mode: 'materialize', rank: 2, path: '/ingest/first', tags: ['a'] },
  { correlation: 'corr-1', domain: 'mesh', rank: 3, tags: ['b'] },
  { id: 'widget-latest', mode: 'audit', rank: 4, metrics: { value: 1, scale: 'high' } },
  { tags: { group: 'incident', confidence: 0.94 }, mode: 'stabilize', rank: 5 },
  { state: 'ready', rank: 6, trace: { source: 'src', target: 'dst', active: true } },
  { id: 'widget-latest', mode: 'isolate', rank: 7, budget: 44 },
  { metrics: { score: 11, variance: 1 }, rank: 8, state: 'observed' },
  { timeline: [{ at: 1, op: 'boot' }], rank: 9, severity: 'low' },
  { id: 'widget-latest', mode: 'policy-reset', rank: 10, active: true },
  { confidence: { a: 1, b: 2, c: 3 }, rank: 11, traceId: 'trace-1' },
  { schedule: [{ ts: 1, phase: 'a' }], rank: 12 },
  { profile: { owner: 'ops', zone: 'us-east' }, rank: 13 },
  { metrics: { errorRate: 0.1, latency: 12 }, rank: 14, tags: ['c'] },
  { command: 'cmd-latest', mode: 'route-fallback', rank: 15 },
  { flags: { canary: false, gated: true }, rank: 16, audit: { at: 1, owner: 'owner' } },
  { id: 'widget-latest', mode: 'policy-enforce', rank: 17, checksum: 'sum-1' },
  { schedule: ['x', 'y', 'z'], rank: 18 },
  { signal: { kind: 'k', payload: {} }, rank: 19 },
  { id: 'widget-latest', mode: 'mesh-check', rank: 20 },
  { bounds: [0, 1, 2, 3], rank: 21 },
  { budget: { floor: 1, ceil: 4 }, rank: 22 },
  { route: '/mesh/check', mode: 'workload-balance', rank: 23 },
  { source: 'agent', mode: 'node-recover', rank: 24 },
  { trace: { a: '1', b: '2', c: '3' }, rank: 25 },
  { profile: { env: 'prod', region: 'us', team: 'ops' }, mode: 'observe', rank: 26 },
]);
