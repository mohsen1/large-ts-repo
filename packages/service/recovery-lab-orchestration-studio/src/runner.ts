import { Brand, NoInfer } from '@shared/type-level';
import type { PluginCatalog } from '@shared/lab-simulation-kernel';
import { createTimeline, type TimelineIterator } from '@shared/lab-simulation-kernel';
import { RecoveryStudioOrchestrator } from './orchestrator';

export type RunnerTag = Brand<string, 'RunnerTag'>;
export interface RunnerConfig<T extends PluginCatalog> {
  readonly tenant: string;
  readonly workspace: string;
  readonly catalog: T;
}

export interface RunnerResult {
  readonly batchId: RunnerTag;
  readonly traces: readonly string[];
  readonly success: number;
  readonly failed: number;
}

export const runBatch = async <T extends PluginCatalog>(
  config: NoInfer<RunnerConfig<T>>,
): Promise<RunnerResult> => {
  const timeline: TimelineIterator<RunnerConfig<T>> = createTimeline([config]);
  const orchestrator = new RecoveryStudioOrchestrator(config.catalog);

  let success = 0;
  let failed = 0;
  const traces: string[] = [];

  for (const item of timeline) {
    const result = await orchestrator.run({
      tenant: item.payload.tenant,
      workspace: item.payload.workspace,
      scenarioId: 'batch',
      includeTelemetry: true,
      pluginFilter: ['auto'],
    });

    if (result.ok) {
      success += 1;
      traces.push(`ok:${result.value.runId}`);
    } else {
      failed += 1;
      traces.push(`err:${result.error.message}`);
    }
  }

  return {
    batchId: 'batch::studio' as RunnerTag,
    traces,
    success,
    failed,
  };
};
