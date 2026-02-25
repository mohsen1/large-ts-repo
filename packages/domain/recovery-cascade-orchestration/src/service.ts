import { defaultPlugins, pluginByName } from './plugins.js';
import { asBlueprint, bootstrapManifest, type BlueprintExecutionArgs, type BlueprintManifest } from './blueprints.js';
import { runBlueprint } from './runtime.js';
import { type Result, isOk } from '@shared/result';
import type { RunId, TenantId, BlueprintExecutionArgs as BlueprintRunArgs, BlueprintResult } from './blueprints.js';

export interface CascadeRunner {
  readonly run: <TBlueprint extends BlueprintManifest>(
    blueprint: TBlueprint,
    tenantId: string,
    runTag: string,
  ) => Promise<Result<BlueprintResult<TBlueprint['stages']>>>;
  readonly listPlugins: () => string[];
  readonly hasPlugin: (name: string) => boolean;
}

const defaultBlueprint = asBlueprint(bootstrapManifest);
const buildRunId = (runTag: string): RunId => `run:${runTag}` as RunId;
const coerceTenant = (tenantId: string): TenantId => tenantId as TenantId;
const buildInputs = <TBlueprint extends BlueprintManifest>(
  blueprint: TBlueprint,
): BlueprintRunArgs<TBlueprint['stages']>['inputs'] =>
  Object.fromEntries(
    blueprint.stages.map((stage) => [stage.name, stage.input]),
  ) as BlueprintRunArgs<TBlueprint['stages']>['inputs'];

export const createCascadeRunner = (): CascadeRunner => {
  return {
    run: async <TBlueprint extends BlueprintManifest>(
      blueprint: TBlueprint,
      tenantId: string,
      runTag: string,
    ) => {
      const args: BlueprintExecutionArgs<TBlueprint['stages']> = {
        tenantId: coerceTenant(tenantId),
        blueprint: blueprint as never,
        inputs: buildInputs(blueprint),
        runId: buildRunId(runTag),
      };
      return runBlueprint(args as never);
    },
    listPlugins: () => defaultPlugins.map((plugin) => plugin.name),
    hasPlugin: (name) => pluginByName(defaultPlugins, name) != null,
  };
};

export const launchDefaultCascade = async (tenantId: string): Promise<Result<unknown>> => {
  const result = await createCascadeRunner().run(defaultBlueprint, tenantId, 'default');
  if (isOk(result)) {
    return result;
  }
  return result;
};

export const describeDefaultRunner = () => ({
  pluginCount: defaultPlugins.length,
  pluginNames: defaultPlugins.map((plugin) => plugin.name),
  manifest: defaultBlueprint.name,
});

export { BlueprintExecutionArgs, type Result };
