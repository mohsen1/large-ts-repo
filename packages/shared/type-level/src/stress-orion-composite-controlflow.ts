export type ControlPlaneStage =
  | 'enter'
  | 'observe'
  | 'admit'
  | 'validate'
  | 'inspect'
  | 'classify'
  | 'satisfy'
  | 'enrich'
  | 'normalize'
  | 'decompose'
  | 'dispatch'
  | 'queue'
  | 'pick'
  | 'bind'
  | 'align'
  | 'snapshot'
  | 'route'
  | 'trace'
  | 'index'
  | 'resolve'
  | 'assemble'
  | 'review'
  | 'promote'
  | 'stabilize'
  | 'verify'
  | 'commit'
  | 'persist'
  | 'notify'
  | 'score'
  | 'optimize'
  | 'split'
  | 'branch'
  | 'wait'
  | 'collect'
  | 'observeLoop'
  | 'closeLoop'
  | 'audit'
  | 'handoff'
  | 'quorum'
  | 'finalize'
  | 'archive'
  | 'close';

export interface ControlEnvelope<TStage extends ControlPlaneStage = ControlPlaneStage> {
  readonly stage: TStage;
  readonly priority: 'critical' | 'high' | 'normal' | 'low';
  readonly sequence: number;
  readonly payload: {
    readonly id: string;
    readonly tags: readonly string[];
  };
}

export type StageTransition<T extends ControlPlaneStage> = T extends 'enter'
  ? 'observe'
  : T extends 'observe'
    ? 'admit'
    : T extends 'admit'
      ? 'validate'
      : T extends 'validate'
        ? 'inspect'
        : T extends 'inspect'
          ? 'classify'
          : T extends 'classify'
            ? 'satisfy'
            : T extends 'satisfy'
              ? 'enrich'
              : T extends 'enrich'
                ? 'normalize'
                : T extends 'normalize'
                  ? 'decompose'
                  : T extends 'decompose'
                    ? 'dispatch'
                    : T extends 'dispatch'
                      ? 'queue'
                      : T extends 'queue'
                        ? 'pick'
                        : T extends 'pick'
                          ? 'bind'
                          : T extends 'bind'
                            ? 'align'
                            : T extends 'align'
                              ? 'snapshot'
                              : T extends 'snapshot'
                                ? 'route'
                                : T extends 'route'
                                  ? 'trace'
                                  : T extends 'trace'
                                    ? 'index'
                                    : T extends 'index'
                                      ? 'resolve'
                                      : T extends 'resolve'
                                        ? 'assemble'
                                        : T extends 'assemble'
                                          ? 'review'
                                          : T extends 'review'
                                            ? 'promote'
                                            : T extends 'promote'
                                              ? 'stabilize'
                                              : T extends 'stabilize'
                                                ? 'verify'
                                                : T extends 'verify'
                                                  ? 'commit'
                                                  : T extends 'commit'
                                                    ? 'persist'
                                                    : T extends 'persist'
                                                      ? 'notify'
                                                      : T extends 'notify'
                                                        ? 'score'
                                                        : T extends 'score'
                                                          ? 'optimize'
                                                          : T extends 'optimize'
                                                            ? 'split'
                                                            : T extends 'split'
                                                              ? 'branch'
                                                              : T extends 'branch'
                                                                ? 'wait'
                                                                : T extends 'wait'
                                                                  ? 'collect'
                                                                  : T extends 'collect'
                                                                    ? 'observeLoop'
                                                                    : T extends 'observeLoop'
                                                                      ? 'closeLoop'
                                                                      : T extends 'closeLoop'
                                                                        ? 'audit'
                                                                        : T extends 'audit'
                                                                          ? 'handoff'
                                                                          : T extends 'handoff'
                                                                            ? 'quorum'
                                                                            : T extends 'quorum'
                                                                              ? 'finalize'
                                                                              : T extends 'finalize'
                                                                                ? 'archive'
                                                                                : 'close';

export type BranchContext = {
  readonly source: 'edge' | 'core' | 'mesh' | 'silo' | 'meshPrimary';
  readonly stage: ControlPlaneStage;
};

export type StageByLevel<T extends number> = T extends 0
  ? 'enter'
  : T extends 1
    ? 'observe'
    : T extends 2
      ? 'validate'
      : T extends 3
        ? 'inspect'
        : T extends 4
          ? 'route'
          : 'close';

export type PipelinePath<T extends readonly ControlPlaneStage[]> = T extends readonly [infer H extends ControlPlaneStage, ...infer R extends ControlPlaneStage[]]
  ? [H, ...PipelinePath<R>]
  : [];

export type Decrement<T extends number> = [
  never,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  50,
][T];

export type ControlRunbook<T extends ControlPlaneStage, N extends number = 18> = N extends 0
  ? []
  : [T, ...ControlRunbook<StageTransition<T>, Decrement<N>>];

export type ResolveByContext<T extends BranchContext> =
  T extends { source: 'edge'; stage: 'closeLoop' }
    ? 'offload'
    : T extends { source: 'core'; stage: 'finalize' }
      ? 'audit'
      : T extends { source: 'mesh'; stage: 'archive' }
        ? 'archive'
        : 'observe';

export const stageLine = ['enter', 'observe', 'admit', 'validate', 'inspect', 'classify', 'satisfy', 'enrich', 'normalize', 'decompose', 'dispatch', 'queue', 'pick', 'bind', 'align', 'snapshot', 'route', 'trace', 'index', 'resolve', 'assemble', 'review', 'promote', 'stabilize', 'verify', 'commit', 'persist', 'notify', 'score', 'optimize', 'split', 'branch', 'wait', 'collect', 'observeLoop', 'closeLoop', 'audit', 'handoff', 'quorum', 'finalize', 'archive', 'close'] as const;

export const stageIndex: Readonly<Record<ControlPlaneStage, number>> = stageLine.reduce(
  (acc, stage, index) => {
    acc[stage] = index;
    return acc;
  },
  Object.create(null) as Record<ControlPlaneStage, number>,
);

export const isTerminal = (stage: ControlPlaneStage): boolean => stage === 'close' || stage === 'archive';

export const nextStage = (stage: ControlPlaneStage): StageTransition<ControlPlaneStage> => {
  switch (stage) {
    case 'enter':
      return 'observe';
    case 'observe':
      return 'admit';
    case 'admit':
      return 'validate';
    case 'validate':
      return 'inspect';
    case 'inspect':
      return 'classify';
    case 'classify':
      return 'satisfy';
    case 'satisfy':
      return 'enrich';
    case 'enrich':
      return 'normalize';
    case 'normalize':
      return 'decompose';
    case 'decompose':
      return 'dispatch';
    case 'dispatch':
      return 'queue';
    case 'queue':
      return 'pick';
    case 'pick':
      return 'bind';
    case 'bind':
      return 'align';
    case 'align':
      return 'snapshot';
    case 'snapshot':
      return 'route';
    case 'route':
      return 'trace';
    case 'trace':
      return 'index';
    case 'index':
      return 'resolve';
    case 'resolve':
      return 'assemble';
    case 'assemble':
      return 'review';
    case 'review':
      return 'promote';
    case 'promote':
      return 'stabilize';
    case 'stabilize':
      return 'verify';
    case 'verify':
      return 'commit';
    case 'commit':
      return 'persist';
    case 'persist':
      return 'notify';
    case 'notify':
      return 'score';
    case 'score':
      return 'optimize';
    case 'optimize':
      return 'split';
    case 'split':
      return 'branch';
    case 'branch':
      return 'wait';
    case 'wait':
      return 'collect';
    case 'collect':
      return 'observeLoop';
    case 'observeLoop':
      return 'closeLoop';
    case 'closeLoop':
      return 'audit';
    case 'audit':
      return 'handoff';
    case 'handoff':
      return 'quorum';
    case 'quorum':
      return 'finalize';
    case 'finalize':
      return 'archive';
    case 'archive':
      return 'close';
    case 'close':
      return 'close';
    default:
      return 'close';
  }
};

export type ControlPlaneRunbook = ControlPlaneStage[];

export const buildControlTrace = (start: ControlPlaneStage): ControlPlaneRunbook => {
  const trace: ControlPlaneRunbook = [];
  let cursor: ControlPlaneStage = start;
  let guard = 0;
  while (!isTerminal(cursor) && guard < stageLine.length) {
    trace.push(cursor);
    cursor = nextStage(cursor) as ControlPlaneStage;
    guard += 1;
  }
  trace.push(cursor);
  return trace;
};

export const resolvePriority = (
  priority: ControlEnvelope['priority'],
  stage: ControlPlaneStage,
): number => {
  if (stage === 'enter' || stage === 'close') {
    return 0;
  }

  if (priority === 'critical') {
    return stage === 'verify' || stage === 'commit' ? 100 : 90;
  }

  if (priority === 'high') {
    return stageIndex[stage] + 40;
  }

  if (priority === 'normal') {
    return stageIndex[stage] + 20;
  }

  return stageIndex[stage] + 5;
};

export const evaluateControlPlane = (seed: ControlEnvelope): {
  readonly resolved: ReadonlyArray<{ readonly stage: ControlPlaneStage; readonly score: number; readonly terminal: boolean }>;
  readonly route: ReadonlyArray<ControlPlaneStage>;
} => {
  const trace = buildControlTrace(seed.stage);
  const resolved: Array<{ stage: ControlPlaneStage; score: number; terminal: boolean }> = [];

  for (const stage of trace) {
    const score = resolvePriority(seed.priority, stage);
    const terminal = isTerminal(stage);
    resolved.push({ stage, score, terminal });

    if (score > 90 && terminal) {
      return {
        resolved,
        route: trace,
      };
    }

    if (stage === 'close' && score < 100) {
      break;
    }
  }

  return {
    resolved,
    route: trace,
  };
};

export const runControlBoard = (): Array<{
  readonly stage: ControlPlaneStage;
  readonly plan: StageTransition<ControlPlaneStage>;
  readonly stageByLevel: StageByLevel<0 | 1 | 2 | 3 | 4>;
  readonly context: ResolveByContext<{
    readonly source: 'edge';
    readonly stage: ControlPlaneStage;
  }>;
}> => {
  const runbook: ControlPlaneRunbook = buildControlTrace('enter');
  const output = runbook.map((stage) => ({
    stage,
    plan: nextStage(stage),
    stageByLevel: stage === 'enter'
      ? 'enter'
      : stage === 'observe'
        ? 'observe'
        : stage === 'validate'
          ? 'inspect'
          : stage === 'inspect'
            ? 'inspect'
            : 'close',
    context: 'observe' as ResolveByContext<{
      source: 'edge';
      stage: ControlPlaneStage;
    }>,
  }));

  return output as Array<{
    readonly stage: ControlPlaneStage;
    readonly plan: StageTransition<ControlPlaneStage>;
    readonly stageByLevel: StageByLevel<0 | 1 | 2 | 3 | 4>;
    readonly context: ResolveByContext<{
      readonly source: 'edge';
      readonly stage: ControlPlaneStage;
    }>;
  }>;
};
