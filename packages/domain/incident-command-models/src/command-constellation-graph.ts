import type { CommandId } from './types';
import {
  type ConstellationOrchestrationPlan,
  type ConstellationRunId,
  type ConstellationSignalEnvelope,
  type ConstellationStage,
  type ConstellationStageId,
  ConstellationEventName,
  type ConstellationExecutionResult,
  type ConstellationPluginContextState,
} from './command-constellation-types';

const commandIdToStageId = (commandId: CommandId): ConstellationStageId => `cmd:${commandId}` as ConstellationStageId;

type VertexRecord<T extends readonly ConstellationStage[]> = {
  [K in T[number] as K['id']]: K;
};

type DependencyMatrix = Record<ConstellationStageId, readonly ConstellationStageId[]>;

export interface ConstellationGraph<TStages extends readonly ConstellationStage[] = readonly ConstellationStage[]> {
  readonly stages: TStages;
  readonly map: VertexRecord<TStages>;
  readonly dependencyMap: DependencyMatrix;
}

export interface StagePathMetric {
  readonly from: ConstellationStageId;
  readonly to: ConstellationStageId;
  readonly distance: number;
}

export interface StagePathProfile {
  readonly stageId: ConstellationStageId;
  readonly order: readonly ConstellationStageId[];
  readonly score: number;
}

export interface ConstellationGraphRuntime {
  readonly planId: string;
  readonly generatedAt: string;
  readonly pathProfile: readonly StagePathProfile[];
  readonly metrics: readonly StagePathMetric[];
}

export interface ConstellationGraphConfig {
  readonly maxHops: number;
  readonly strict: boolean;
}

export interface RuntimeSummaryInput {
  readonly result: ConstellationExecutionResult;
  readonly graph: ConstellationGraphRuntime;
}

const rankByDependents = (map: DependencyMatrix): readonly ConstellationStageId[] =>
  Object.entries(map)
    .map(([id, dependencies]) => ({
      id: id as ConstellationStageId,
      score: dependencies.length,
    }))
    .sort((left, right) => left.score - right.score)
    .map((entry) => entry.id);

export const buildConstellationGraph = <TStages extends readonly ConstellationStage[]>(
  stages: TStages,
  dependencyMap: Record<string, readonly ConstellationStageId[]>,
): ConstellationGraph<TStages> => {
  const index = new Map(stages.map((stage) => [stage.id, stage]));
  const fallback: DependencyMatrix = {};

  for (const stage of stages) {
    fallback[stage.id] = stage.commandIds.map(commandIdToStageId);
  }

  const merged: DependencyMatrix = {
    ...fallback,
    ...dependencyMap,
  };

  return {
    stages,
    map: Object.fromEntries(index) as VertexRecord<TStages>,
    dependencyMap: merged,
  };
};

const pathLength = (path: readonly ConstellationStageId[]): number =>
  path.reduce((total, stageId) => total + (String(stageId).length % 7), 0);

export const enumeratePaths = (plan: ConstellationOrchestrationPlan): readonly ConstellationStageId[][] => {
  const byId = new Map(plan.stages.map((stage) => [stage.id, stage]));
  const result: ConstellationStageId[][] = [];

  const stackWalk = (id: ConstellationStageId, seen: readonly ConstellationStageId[]) => {
    if (seen.includes(id)) {
      return;
    }

    const stage = byId.get(id);
    const children = stage?.commandIds.length
      ? stage.commandIds.map(commandIdToStageId)
      : [];

    if (children.length === 0) {
      result.push([...seen, id]);
      return;
    }

    for (const child of children) {
      stackWalk(child, [...seen, id]);
    }
  };

  for (const stage of plan.stages) {
    stackWalk(stage.id, []);
  }

  return result.length ? result : [plan.stageIds.slice()];
};

const toProfiles = (paths: readonly ConstellationStageId[][]): readonly StagePathProfile[] =>
  paths.map((path) => ({
    stageId: path[0] ?? ('seed-stage' as ConstellationStageId),
    order: path,
    score: pathLength(path),
  } as const));

const toPathMetrics = (paths: readonly ConstellationStageId[][]): readonly StagePathMetric[] => {
  const out: StagePathMetric[] = [];

  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i += 1) {
      const from = path[i];
      const to = path[i + 1];
      out.push({
        from,
        to,
        distance: Math.max(1, Math.abs(String(from).length - String(to).length)),
      });
    }
  }

  return out;
};

export const renderGraphRuntime = (
  plan: ConstellationOrchestrationPlan,
  config: ConstellationGraphConfig,
): ConstellationGraphRuntime => {
  const paths = enumeratePaths(plan);
  const pathProfile = toProfiles(paths);
  const metrics = toPathMetrics(paths);
  return {
    planId: plan.id,
    generatedAt: new Date().toISOString(),
    pathProfile: config.strict ? pathProfile.slice(0, config.maxHops) : pathProfile,
    metrics,
  };
};

export const summarizeExecution = ({ result, graph }: RuntimeSummaryInput): string =>
  `${result.runId} => stages:${result.stages.length}, artifacts:${result.artifacts.length}, path:${graph.pathProfile.length}`;

export const summarizeResult = ({
  graph,
  context,
  result,
}: {
  readonly graph: ConstellationGraphRuntime;
  readonly context?: ConstellationPluginContextState;
  readonly result: ConstellationExecutionResult;
}): string =>
  `${result.planId} #${result.runId} ${context ? `tenant:${context.tenant}` : ''} stages:${result.stages.length} edges:${graph.metrics.length} paths:${graph.pathProfile.length}`;

export const zipProfiles = (
  signals: readonly ConstellationSignalEnvelope[],
  stages: readonly ConstellationStage[],
): readonly [ConstellationSignalEnvelope, ConstellationStage][] => {
  if (stages.length === 0) {
    return [];
  }

  return signals.map(
    (signal, index) =>
      [
        signal,
        stages[index % stages.length],
      ] as const,
  );
};

export const runIdFromResult = (result: { readonly runId: ConstellationRunId }): ConstellationRunId => result.runId;

export const commandCountFromPlan = (plan: ConstellationOrchestrationPlan): readonly [CommandId, ...CommandId[]] =>
  (plan.commands.map((command) => command.id) as [CommandId, ...CommandId[]]);

export const stageIdStream = (graph: ConstellationGraph): readonly ConstellationStageId[] =>
  [...graph.stages].map((stage) => stage.id);

export const eventNameForStage = (stage: ConstellationStage, step: number): ConstellationEventName =>
  `constellation:event:${stage.phase === 'scan' ? 'scan' : step % 2 === 0 ? 'plan' : 'simulate'}`;
