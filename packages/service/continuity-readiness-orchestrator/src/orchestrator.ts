import { isOk, ok, fail, type Result } from '@shared/result';
import {
  ContinuityReadinessIds,
  type ContinuityReadinessEnvelope,
  type ContinuityReadinessRun,
  type ContinuityReadinessSignal,
  type ContinuityReadinessTenantId,
  type ContinuityReadinessSurfaceId,
} from '@domain/recovery-continuity-readiness';
import { summarizeReadinessReadings } from './analytics';
import { assembleReadinessPlan, type ContinuityReadinessPlanInput } from './planner';
import { inMemoryAdapters, type ContinuityReadinessAdapters } from './adapters';

export interface OrchestrationInput {
  readonly tenantId: ContinuityReadinessTenantId;
  readonly tenantName: string;
  readonly surfaceId: ContinuityReadinessSurfaceId;
  readonly signals: readonly ContinuityReadinessSignal[];
  readonly objective: string;
  readonly horizonMinutes: number;
}

const nowIso = (): string => new Date().toISOString();

const makeRun = (envelope: ContinuityReadinessEnvelope): ContinuityReadinessRun => ({
  id: envelope.run?.id ?? ContinuityReadinessIds.run(`run:${envelope.tenantId}:${Date.now()}`),
  surfaceId: envelope.surface.id,
  tenantId: envelope.tenantId,
  planId: envelope.surface.plans[0]?.id ?? ContinuityReadinessIds.plan(`fallback:${Date.now()}`),
  phase: envelope.surface.plans[0]?.phase ?? 'observe',
  startedAt: envelope.run?.startedAt ?? nowIso(),
  startedBy: envelope.run?.startedBy ?? 'continuity-orchestrator',
  expectedFinishAt: envelope.run?.expectedFinishAt ?? new Date(Date.now() + 45 * 60 * 1000).toISOString(),
  currentScore: envelope.coverage.length > 0 ? envelope.coverage.reduce((acc, entry) => acc + entry.score, 0) / envelope.coverage.length : 50,
  riskBand: envelope.surface.plans[0]?.risk ?? 'medium',
  active: envelope.run?.active ?? true,
  metadata: {
    summary: envelope.run?.metadata ?? {},
    forecastTrend: envelope.projection.trend,
  },
});

export class ContinuityReadinessOrchestrator {
  constructor(private readonly adapters: ContinuityReadinessAdapters) {}

  async run(input: OrchestrationInput): Promise<Result<ContinuityReadinessRun, Error>> {
    const request: ContinuityReadinessPlanInput = {
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      surfaceId: input.surfaceId,
      signals: input.signals,
      objective: input.objective,
      horizonMinutes: input.horizonMinutes,
    };

    const planned = await assembleReadinessPlan(request);
    if (!planned.ok) {
      await this.adapters.notifications.notifyCritical({
        tenantId: input.tenantId,
        reason: planned.error.message,
      });
      return fail(planned.error);
    }

    const run = makeRun(planned.value.envelope);
    const persistEnvelope = await this.adapters.gateway.persistEnvelope({
      ...planned.value.envelope,
      run,
    });
    if (!persistEnvelope.ok) return fail(persistEnvelope.error);

    const persistRun = await this.adapters.gateway.persistRun(run);
    if (!persistRun.ok) return fail(persistRun.error);

    const announce = await this.adapters.gateway.announceSelection(run);
    if (!announce.ok) return fail(announce.error);

    const metrics = summarizeReadinessReadings(planned.value.envelope);
    if (!isOk(metrics)) {
      await this.adapters.notifications.notifyCritical({ tenantId: input.tenantId, reason: 'metrics failed' });
      return fail(metrics.error);
    }

    if (run.riskBand === 'critical') {
      await this.adapters.notifications.notifyCritical({
        tenantId: input.tenantId,
        reason: `critical risk: ${planned.value.summary}`,
      });
    }

    return ok(run);
  }
}

export const createContinuityReadinessOrchestrator = (gateway: ContinuityReadinessAdapters['gateway']): ContinuityReadinessOrchestrator => {
  const orchestrator = new ContinuityReadinessOrchestrator(
    inMemoryAdapters(gateway, {
      notifyCritical: async () => ok(undefined),
    }),
  );
  return orchestrator;
};
