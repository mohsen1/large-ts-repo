import {
  createCascadeRunner,
  launchDefaultCascade,
  type BlueprintManifest,
  type BlueprintExecutionArgs,
  type RunId,
} from '@domain/recovery-cascade-orchestration';
import { type Result } from '@shared/result';

const runner = createCascadeRunner();

export const runBootstrapForTenant = async (tenantId: string): Promise<Result<unknown>> => {
  return launchDefaultCascade(tenantId);
};

export const runBlueprintWithRunner = async <T extends BlueprintManifest>(
  blueprint: T,
  tenantId: string,
): Promise<Result<unknown>> => {
  return runner.run(blueprint, tenantId, `tenant:${tenantId}`);
};

export const buildBlueprintArgs = <T extends BlueprintManifest>(
  blueprint: T,
  tenantId: string,
): BlueprintExecutionArgs<T['stages']> => {
  const inputByStage = Object.fromEntries(
    blueprint.stages.map((stage) => [
      stage.name,
      stage.input,
    ]),
  ) as BlueprintExecutionArgs<T['stages']>['inputs'];

  return {
    tenantId: tenantId as BlueprintExecutionArgs<T['stages']>['tenantId'],
    blueprint,
    inputs: inputByStage,
    runId: `run:tenant:${tenantId}:${Date.now()}` as RunId,
  };
};

export const listKnownPlugins = () => runner.listPlugins();
