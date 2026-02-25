import { bootstrapManifest, type BlueprintManifest } from '@domain/recovery-cascade-orchestration';
import { asBlueprint } from '@domain/recovery-cascade-orchestration';

export const bootstrapBlueprintPromise: Promise<BlueprintManifest> = (async () => {
  const source = bootstrapManifest.stages;
  return asBlueprint({
    tenantId: bootstrapManifest.tenantId,
    name: bootstrapManifest.name,
    version: bootstrapManifest.version.replace(/^r/, ''),
    stages: source.map((stage) => ({
      ...stage,
      input: structuredClone(stage.input),
      output: structuredClone(stage.output),
    })),
    tags: [...bootstrapManifest.tags],
  });
})();

export const bootstrapBlueprint: BlueprintManifest = await bootstrapBlueprintPromise;

export const describeBootstrap = {
  tenantCount: 1,
  stageCount: bootstrapBlueprint.stages.length,
  defaultName: bootstrapBlueprint.name,
};
