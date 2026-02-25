import { withEngine, type EngineRun } from '@shared/cascade-orchestration-kernel';
import { runChain, sortStagesByDependency } from './compositions.js';
import type { BlueprintExecutionArgs, BlueprintResult, StageContract } from './blueprints.js';
import { defaultPlugins } from './plugins.js';
import { publishEvents } from './events.js';
import { ok, fail, type Result } from '@shared/result';

export const defaultRunId = `run:${Date.now()}` as const;

export const runBlueprint = async <
  TStages extends readonly StageContract[],
>(
  args: BlueprintExecutionArgs<TStages>,
): Promise<Result<BlueprintResult<TStages>>> => {
  try {
    const startedAt = new Date().toISOString();
    const started = await runChain(args.blueprint.stages, args.inputs);
    const execution = await withEngine(
      {
        runId: args.runId,
        tenantId: args.tenantId,
        plugins: defaultPlugins,
      },
      async (engine) => {
        return engine.execute({
          sort: sortStagesByDependency(args.blueprint.stages),
          payload: args.inputs,
        } as never);
      },
    );

    const eventPayload = {
      runId: args.runId,
      tenantId: args.tenantId,
      planName: args.blueprint.name,
      startedAt,
      finishedAt: execution.completedAt,
    };
    await publishEvents(eventPayload);

    const result: BlueprintResult<TStages> = {
      blueprint: args.blueprint,
      tenantId: args.tenantId,
      runId: args.runId,
      outputs: started as BlueprintResult<TStages>['outputs'],
      startedAt,
      finishedAt: execution.completedAt,
    };

    return ok(result);
  } catch (error) {
    return fail(error as Error, 'runtime.failed');
  }
};

export const buildEngineSnapshot = (run: EngineRun): string => {
  const keys = Object.keys(run.outputs);
  return `${run.runId} (${run.startedAt} -> ${run.completedAt}) ${keys.length} outputs`;
};
