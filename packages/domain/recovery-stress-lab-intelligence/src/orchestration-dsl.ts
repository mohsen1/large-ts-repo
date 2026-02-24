import { Brand, withBrand } from '@shared/core';
import { type RecoverySimulationResult } from './models';
import { parsePath, type SplitPath } from '@domain/recovery-stress-lab-intelligence/flow-graph';

type Brandify<T, B extends string> = Brand<T, B>;

export type WorkflowDslId = Brandify<string, 'WorkflowDslId'>;
export type WorkflowVersion = Brandify<string, 'WorkflowVersion'>;
export type StageScript = readonly WorkflowInstruction[];

export type Tokenize<T extends string> = SplitPath<T>;
export type Command<T extends string> = T extends `${infer Head} ${infer Rest}` ? Head : T;
export type Argv<T extends string> = T extends `${infer _Head} ${infer Rest}` ? Tokenize<Rest> : [];

export type InstructionValue<T extends string> = {
  readonly kind: Command<T>;
  readonly raw: T;
  readonly args: Argv<T>;
};

export type WorkflowNodeState = 'idle' | 'running' | 'blocked' | 'complete' | 'failed';
export type WorkflowMetric = 'latency' | 'reliability' | 'pressure' | 'cost';

export type TemplateRoute<T extends string> = T extends `${infer Prefix}/${infer _Suffix}` ? Prefix : string;
export type RouteTokens<T extends string> = T extends `${infer P}/${infer S}`
  ? [P, ...RouteTokens<S>]
  : [T];

export interface InstructionMeta {
  readonly namespace: string;
  readonly createdBy: string;
  readonly revision: number;
}

export interface WorkflowInstruction {
  readonly id: WorkflowDslId;
  readonly verb: 'start' | 'stop' | 'wait' | 'notify' | 'validate';
  readonly route: string;
  readonly expression: string;
  readonly meta: InstructionMeta;
}

export interface WorkflowCompilationResult<TScript extends StageScript = StageScript> {
  readonly id: WorkflowDslId;
  readonly script: TScript;
  readonly compiledAt: string;
  readonly version: WorkflowVersion;
  readonly metrics: Readonly<Record<WorkflowMetric, number>>;
}

export interface RuntimeDirective<T extends StageScript = StageScript> {
  readonly id: Brandify<string, 'RuntimeDirectiveId'>;
  readonly steps: T;
  readonly deadlineEpochMs: number;
  readonly labels: Readonly<Record<string, string>>;
}

export type ExecutionTuple<T extends StageScript> = T extends readonly [infer Head, ...infer Tail]
  ? Tail extends StageScript
    ? readonly [Head, ...ExecutionTuple<Tail>]
    : readonly []
  : readonly [];

export type RecursivelyMap<T extends readonly WorkflowInstruction[]> = T extends readonly [
  infer Head extends WorkflowInstruction,
  ...infer Tail extends readonly WorkflowInstruction[],
]
  ? { readonly [K in Head['verb']]: Head } & RecursivelyMap<Tail>
  : {};

export const instructionKinds = ['start', 'wait', 'notify', 'validate', 'stop'] as const;

const idBase = 'recovery-stress-lab';

const createInstructionId = (index: number): WorkflowDslId => withBrand(`${idBase}:instr:${index}`, 'WorkflowDslId');

const createDirectiveId = (scriptId: string): Brandify<string, 'RuntimeDirectiveId'> => withBrand(`${idBase}:directive:${scriptId}`, 'RuntimeDirectiveId');

const createVersion = (revision: number): WorkflowVersion => withBrand(`${idBase}:v${revision}`, 'WorkflowVersion');

export const normalizeRoute = (route: string): string => route.trim().replace(/\/+$/, '').toLowerCase();

export const parseRoute = <T extends string>(route: T): RouteTokens<T> => parsePath(normalizeRoute(route) as never);

export const routeAsTemplate = <T extends string>(route: T): TemplateRoute<T> => normalizeRoute(route) as TemplateRoute<T>;

export const parseInstruction = <T extends string>(input: T): InstructionValue<T> => {
  const [command, ...rest] = input.trim().split(' ');
  return {
    kind: (command as Command<T>) ?? ('' as Command<T>),
    raw: input,
    args: (rest.length > 0 ? (rest as Argv<T>) : ([] as Argv<T>)),
  };
};

const normalizeMeta = (meta: InstructionMeta): InstructionMeta => ({
  ...meta,
  namespace: meta.namespace.toLowerCase(),
  revision: Math.max(1, meta.revision),
});

const toInstruction = (index: number, raw: string): WorkflowInstruction => {
  const tokens = parseInstruction(raw as string);
  const normalizedRoute = normalizeRoute(`/${tokens.args.join('/') || 'default'}`);
  return {
    id: createInstructionId(index),
    verb: instructionKinds[index % instructionKinds.length] as WorkflowInstruction['verb'],
    route: normalizedRoute,
    expression: raw,
    meta: normalizeMeta({
      namespace: 'recovery-stress-lab',
      createdBy: 'compiler',
      revision: index + 1,
    }),
  };
};

export const compileWorkflowScript = (script: string, version = 1): WorkflowCompilationResult<StageScript> => {
  const lines = script
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const instructions = lines.map((line, index) => toInstruction(index, line));
  const metrics = {
    latency: lines.length > 0 ? lines.join('').length / lines.length : 0,
    reliability: 0.91,
    pressure: lines.length,
    cost: Math.max(1, lines.length * 0.25),
  } satisfies Record<WorkflowMetric, number>;

  return {
    id: withBrand(`${idBase}:workflow:${Date.now()}`, 'WorkflowDslId'),
    script: instructions,
    compiledAt: new Date().toISOString(),
    version: createVersion(version),
    metrics,
  };
};

export const buildRuntimeDirective = <T extends StageScript>(id: string, steps: T): RuntimeDirective<T> => ({
  id: createDirectiveId(id),
  steps,
  deadlineEpochMs: Date.now() + 30 * 60 * 1000,
  labels: {
    environment: 'synthetic',
    source: 'compiler',
  },
});

const collectByVerb = <T extends StageScript>(script: T): { [K in WorkflowInstruction['verb']]: number } => {
  const counts = {
    start: 0,
    stop: 0,
    wait: 0,
    notify: 0,
    validate: 0,
  };
  for (const item of script) {
    counts[item.verb] += 1;
  }
  return counts;
};

export const compileAndMaterialize = async <T extends string>(source: T) => {
  const compiled = compileWorkflowScript(source);
  const directive = buildRuntimeDirective(`${compiled.id}`, compiled.script);
  const summary = collectByVerb(compiled.script);
  const state = summarizeScriptState(compiled.script, summary);
  return { compiled, directive, state };
};

const summarizeScriptState = <T extends StageScript>(
  script: T,
  summary: { [K in WorkflowInstruction['verb']]: number },
): {
  readonly id: string;
  readonly state: WorkflowNodeState;
  readonly score: number;
} => {
  const isBlocked = summary.wait > summary.start + summary.validate;
  return {
    id: `summary:${script[0]?.id ?? 'empty'}`,
    state: isBlocked ? 'blocked' : script.length > 0 ? 'running' : 'idle',
    score: Math.min(1, Math.max(0, script.length ? (summary.validate + summary.notify) / script.length : 0)),
  };
};

export type InstructionUnion = InstructionValue<string> | WorkflowInstruction;

export const executeInstructionSet = async <
  const TScript extends StageScript,
  TResult extends RecoverySimulationResult,
>(
  script: TScript,
  simulate: (instruction: WorkflowInstruction) => Promise<ExecutionResult>,
): Promise<{
  readonly ok: boolean;
  readonly output: TResult;
}> => {
  const outputs: ExecutionResult[] = [];
  for (const step of script) {
    outputs.push(await simulate(step));
  }
  return {
    ok: outputs.every((entry) => entry.ok),
    output: {
      tenantId: '' as unknown as unknown & { readonly value: string },
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      selectedRunbooks: [],
      ticks: [],
      riskScore: outputs.length,
      slaCompliance: outputs.reduce((acc, entry) => acc + (entry.score ?? 0), 0),
      notes: outputs.map((output) => output.note),
    } as unknown as TResult,
  };
};

export interface ExecutionResult {
  readonly ok: boolean;
  readonly score?: number;
  readonly note: string;
}

export type ScriptByStage = {
  readonly preflight: StageScript;
  readonly runtime: StageScript;
  readonly post: StageScript;
};

export const splitByVerb = (script: StageScript): ScriptByStage => {
  const preflight: WorkflowInstruction[] = [];
  const runtime: WorkflowInstruction[] = [];
  const post: WorkflowInstruction[] = [];

  for (const instruction of script) {
    if (instruction.verb === 'start') {
      preflight.push(instruction);
    } else if (instruction.verb === 'stop') {
      post.push(instruction);
    } else {
      runtime.push(instruction);
    }
  }

  return { preflight, runtime, post };
};

export const scriptRoutes = (script: StageScript): readonly string[] => {
  return script.map((instruction) => routeAsTemplate(instruction.route));
};

export const renderRouteGraph = (script: StageScript): string => {
  const routes = scriptRoutes(script).map((route, index) => `${index}:${route}`);
  return routes.join(' -> ');
};

export const normalizeScriptTuple = <T extends StageScript>(script: T): ExecutionTuple<T> => {
  return ([...script] as unknown) as ExecutionTuple<T>;
};

export const mapRecursively = <T extends StageScript>(
  script: T,
): RecursivelyMap<T> => {
  const grouped = {} as RecursivelyMap<T>;
  for (const instruction of script) {
    (grouped as Record<string, WorkflowInstruction>)[instruction.verb] = instruction;
  }
  return grouped;
};

export const buildReplayPlan = (script: StageScript, revision: number): {
  readonly compiled: WorkflowCompilationResult<StageScript>;
  readonly scriptMap: RecursivelyMap<StageScript>;
} => {
  const compiled = compileWorkflowScript(script.map((entry) => entry.expression).join('\n'), revision);
  const scriptMap = mapRecursively(compiled.script);
  return { compiled, scriptMap };
};
