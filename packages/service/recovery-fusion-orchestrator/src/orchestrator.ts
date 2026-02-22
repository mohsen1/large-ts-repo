import { fail, ok, type Result } from '@shared/result';
import {
  type FusionBundleId,
  type FusionContext,
  type FusionLifecycleEvent,
  type FusionPlanCommand,
  type FusionServiceDeps,
  type FusionCycleResult,
  type FusionStore,
  type FusionMetrics,
} from './types';
import { runPipeline } from './pipeline';
import { buildBundleCommand, summarizeCycle } from './diagnostics';
import { evaluateBundle, planFusionBundle } from '@domain/recovery-fusion-intelligence';
import type { FusionPlanRequest } from '@domain/recovery-fusion-intelligence';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RunSession } from '@domain/recovery-operations-models';

const toRunState = (value: FusionLifecycleEvent['eventType']): 'running' | 'complete' | 'error' => {
  switch (value) {
    case 'wave_started':
      return 'running';
    case 'bundle_closed':
      return 'complete';
    default:
      return 'running';
  }
};

const buildTopology = (bundle: Parameters<typeof evaluateBundle>[0]) => ({
  nodes: bundle.waves.map((wave) => ({
    id: wave.id,
    label: wave.id,
    weight: wave.score,
    parents: [],
    children: [],
  })),
  edges: bundle.waves.flatMap((wave, index) =>
    index === 0
      ? []
      : [
          {
            from: bundle.waves[index - 1]?.id ?? wave.id,
            to: wave.id,
            latencyMs: 15,
            riskPenalty: 0.02,
          },
        ],
  ),
});

export class RecoveryFusionOrchestrator {
  private readonly context: FusionContext;
  private readonly store: FusionStore;
  private readonly bus: FusionServiceDeps['bus'];
  private cycles = new Map<string, number>();

  constructor(private readonly deps: FusionServiceDeps) {
    this.context = deps.context;
    this.store = deps.store;
    this.bus = deps.bus;
  }

  async run(request: FusionPlanRequest): Promise<Result<FusionCycleResult, Error>> {
    const planned = planFusionBundle(request);
    if (!planned.ok) {
      return fail(planned.error);
    }

    const pipeline = await runPipeline(request, this.deps);
    if (!pipeline.ok) {
      return fail(pipeline.error);
    }

    const list = await this.store.list(request.runId);
    const cycle = summarizeCycle(request, planned.value, list.length);
    this.cycles.set(request.planId, (this.cycles.get(request.planId) ?? 0) + 1);

    const topology = buildTopology(pipeline.value.bundle);
    const evaluation = evaluateBundle(pipeline.value.bundle, topology);
    const evaluated = evaluation.ok ? evaluation.value.evaluation : [];

    await this.bus.send({
      eventId: `bundle-complete:${pipeline.value.bundle.id}`,
      eventType: 'bundle_closed',
      tenant: this.context.tenant,
      bundleId: pipeline.value.bundle.id,
      occurredAt: new Date().toISOString(),
      payload: { accepted: planned.value.accepted },
    });

    return ok({
      bundleId: pipeline.value.bundle.id,
      planId: request.planId,
      runId: String(request.runId),
      accepted: planned.value.accepted,
      evaluations: evaluated,
      snapshots: [
        {
          tenant: this.context.tenant,
          planId: request.planId,
          runId: request.runId,
          requestedBy: this.context.owner,
          createdAt: new Date().toISOString(),
          waves: request.waves,
          planResult: planned.value,
        },
      ],
    });
  }

  async command(runId: RecoveryRunState['runId'], command: FusionPlanCommand): Promise<Result<boolean, Error>> {
    const bundles = await this.store.list(runId);
    if (bundles.length === 0) {
      return fail(new Error(`no bundle for ${runId}`));
    }

    const event: FusionLifecycleEvent = {
      eventId: `command:${command.targetWaveId}:${Date.now()}`,
      eventType: command.command === 'abort' ? 'bundle_closed' : 'wave_started',
      tenant: this.context.tenant,
      bundleId: bundles[0].id,
      occurredAt: new Date().toISOString(),
      payload: buildBundleCommand(command),
    };

    await this.bus.send(event);
    return ok(true);
  }

  async status(bundleId: FusionBundleId): Promise<Result<'unknown' | 'running' | 'complete' | 'error', Error>> {
    const bundle = await this.store.get(bundleId);
    if (!bundle) {
      return fail(new Error('bundle not found'));
    }

    const active = this.cycles.get(bundle.planId) ?? 0;
    const state = active > 2 ? 'complete' : 'running';
    return ok(state);
  }

  async replayEvents(runId: RecoveryRunState['runId']): Promise<Result<readonly FusionLifecycleEvent[], Error>> {
    const events: FusionLifecycleEvent[] = [];
    const busEvents = this.bus.receive(runId);

    for await (const event of busEvents) {
      const isEvent = event && typeof event === 'object' && 'eventType' in event;
      if (isEvent) {
        events.push(event as FusionLifecycleEvent);
      }
    }

    return ok(events);
  }

  async metrics(runId: RecoveryRunState['runId']): Promise<Result<FusionMetrics, Error>> {
    const bundles = await this.store.list(runId);
    return ok(
      bundles.reduce<FusionMetrics>(
        (acc, bundle) => ({
          latencyP50: acc.latencyP50 + bundle.waves.length,
          latencyP90: acc.latencyP90 + bundle.waves.reduce((sum, wave) => sum + wave.commands.length, 0),
          commandCount: acc.commandCount + 1,
          evaluationCount: acc.evaluationCount + bundle.waves.length,
        }),
        { latencyP50: 0, latencyP90: 0, commandCount: 0, evaluationCount: 0 },
      ),
    );
  }
}

export const createRecoveryFusionOrchestrator = (deps: FusionServiceDeps): RecoveryFusionOrchestrator => {
  return new RecoveryFusionOrchestrator(deps);
};

export const mapSessionToRequest = (session: RunSession): FusionPlanRequest => ({
  planId: `${session.planId}:replay` as unknown as FusionPlanRequest['planId'],
  runId: session.runId,
  waves: [],
  signals: [],
  budget: session.constraints,
});

export const stateFromEvents = (state: 'running' | 'complete' | 'error') => {
  const runState = toRunState('bundle_closed');
  return {
    state,
    runState,
  };
};
