import type {
  ContinuityPlanRecord,
  ContinuityPlanStore,
  PlanRunRecord,
} from '@data/recovery-continuity-plan-store';
import { fail, ok, type Result } from '@shared/result';
import { ContinuityS3Archive } from './archive';
import { ContinuityEventBridgeAdapter } from './bridge';

interface DispatcherConfig {
  readonly s3Bucket: string;
  readonly eventBus: string;
  readonly region?: string;
}

export interface ContinuityDispatcher {
  persistAndPublish(
    planStore: ContinuityPlanStore,
    plan: ContinuityPlanRecord,
    run: PlanRunRecord,
  ): Promise<Result<void, Error>>;
}

export class S3AndEventBridgeDispatcher implements ContinuityDispatcher {
  private readonly bridge: ContinuityEventBridgeAdapter;
  private readonly archive: ContinuityS3Archive;

  constructor(config: DispatcherConfig) {
    this.archive = new ContinuityS3Archive({
      bucketName: config.s3Bucket,
      region: config.region,
    });
    this.bridge = new ContinuityEventBridgeAdapter({
      eventBusName: config.eventBus,
      region: config.region,
    });
  }

  async persistAndPublish(
    planStore: ContinuityPlanStore,
    plan: ContinuityPlanRecord,
    run: PlanRunRecord,
  ): Promise<Result<void, Error>> {
    const archivedPlan = await this.archive.putPlan(plan);
    if (!archivedPlan.ok) return fail(archivedPlan.error);

    const archivedRun = await this.archive.putRun(run);
    if (!archivedRun.ok) return fail(archivedRun.error);

    const savedRun = await planStore.upsertRun(run);
    if (!savedRun.ok) return fail(savedRun.error);

    const eventResult = await this.bridge.emitBatch([
      {
        tenantId: run.tenantId,
        planId: plan.id,
        runId: run.runId,
        eventName: 'plan.run.persisted',
        payload: {
          runId: run.runId,
          planId: plan.id,
          state: run.context.state,
        },
      },
    ]);

    if (!eventResult.ok) return fail(eventResult.error);

    await planStore.savePlan(plan);
    return ok(undefined);
  }
}

export const createDispatcher = (config: DispatcherConfig): ContinuityDispatcher =>
  new S3AndEventBridgeDispatcher(config);
