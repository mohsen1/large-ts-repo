import { ok, err, Result } from '@shared/result';
import { EventBridgeConnector, SqsRunAdapter } from '@infrastructure/incident-connectors';
import { AdaptiveRunStore, AdaptiveRunId, InMemoryAdaptiveRunStore, AdaptiveRunStoreAdapterImpl, toPolicyFallback } from '@data/adaptive-ops-store';
import { RunnerInput, RunnerResult } from './types';
import { runAdaptation } from './pipeline';

export interface AdaptiveOpsEngine {
  execute(input: RunnerInput): Promise<Result<RunnerResult, string>>;
}

export class DefaultAdaptiveOpsEngine implements AdaptiveOpsEngine {
  constructor(
    private readonly store: AdaptiveRunStore,
    private readonly connector: EventBridgeConnector,
    private readonly sqs: SqsRunAdapter,
  ) {}

  async execute(input: RunnerInput): Promise<Result<RunnerResult, string>> {
    const result = runAdaptation(input);

    const saved = await this.store.saveRun(result.run);
    if (!saved.ok) {
      return err('run persistence failed');
    }

    for (const decision of result.decisions) {
      const publishedDecision = await this.connector.publishDecision(decision, result.run);
      if (!publishedDecision.ok) {
        return err(`decision publish failed: ${publishedDecision.error}`);
      }

      const publishedActions = await this.connector.publishActions(decision.selectedActions);
      if (!publishedActions.ok) {
        return err(`action publish failed: ${publishedActions.error}`);
      }

      await this.store.appendDecision(
        result.run.incidentId as unknown as AdaptiveRunId,
        toPolicyFallback(result.run.incidentId as unknown as AdaptiveRunId),
        decision,
      );
    }

    const queued = await this.sqs.publishRun(result.run);
    if (!queued.ok) {
      return err(`run queue failed: ${queued.error}`);
    }

    return ok(result);
  }
}

export const createEngine = (): AdaptiveOpsEngine => {
  const store: AdaptiveRunStore = new InMemoryAdaptiveRunStore();
  const connector = EventBridgeConnector.create({ busName: 'adaptive-ops-events' });
  const sqs = SqsRunAdapter.create({ queueUrl: 'https://sqs.us-east-1.amazonaws.com/000000000000/adaptive-ops' });

  return new DefaultAdaptiveOpsEngine(store, connector, sqs);
};

export { InMemoryAdaptiveRunStore as InMemoryEngineStore } from '@data/adaptive-ops-store';
