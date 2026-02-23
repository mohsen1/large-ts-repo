import { SignalStore } from '@data/recovery-signal-intelligence-store';
import {
  buildPriorities,
  aggregateByDimension,
  toSignalGraph,
  type SignalBundle,
  type SignalPlan,
  type SignalCommand,
  type SignalFeedSnapshot,
} from '@domain/recovery-signal-intelligence';
import { runPipeline, validatePlan, enrichBundle, commandLineage } from './pipeline';
import { buildSignalPulseSummary, telemetry } from './telemetry';

const commandId = (seed: string): string => `cmd-${seed}-${Date.now()}`;

export class RecoverySignalOrchestrator {
  private readonly store: SignalStore;
  private readonly runHistory: string[] = [];

  constructor(store: SignalStore) {
    this.store = store;
  }

  async ingestBundle(bundle: SignalBundle): Promise<SignalFeedSnapshot> {
    const deduped = await runPipeline(bundle, [
      { name: 'dedupe', execute: enrichBundle },
    ]);

    if (!deduped.success) {
      throw new Error(deduped.errors.join(', '));
    }

    const clean = bundle;
    const result = this.store.upsertBundle(clean);

    if (!result.ok) {
      throw result.error;
    }

    const snapshotResult = this.store.buildSnapshot(bundle.id);
    if (!snapshotResult.ok) {
      throw snapshotResult.error;
    }

    this.runHistory.push(`ingested:${bundle.id}`);
    return snapshotResult.value;
  }

  createPlanForBundle(bundleId: string): SignalPlan {
    const pulses = this.store.getPulses(bundleId);
    const graph = toSignalGraph(pulses);
    const priorities = buildPriorities({
      facilityId: pulses[0]?.facilityId ?? 'unknown',
      tenantId: pulses[0]?.tenantId ?? 'unknown',
      asOf: new Date().toISOString(),
      pulses,
      priorities: [],
      intensityByDimension: aggregateByDimension(pulses),
    });

    const actions = priorities.slice(0, 4).map((priority, index) => ({
      actionId: `act-${priority.pulseId}-${index}`,
      pulseId: priority.pulseId,
      dimension: pulses.find((pulse) => pulse.id === priority.pulseId)?.dimension ?? 'capacity',
      runbook: 'staged-recovery',
      command: `stabilize-${priority.pulseId}`,
      expectedSavings: Math.max(0, 100 - priority.rank * 7),
    }));

    const plan: SignalPlan = {
      id: `plan-${bundleId}`,
      tenantId: pulses[0]?.tenantId ?? 'tenant-unknown',
      signals: pulses,
      windows: graph.graph.nodes.slice(0, 3).map((pulse, index) => ({
        start: new Date(Date.now() + index * 45 * 1000).toISOString(),
        end: new Date(Date.now() + (index + 1) * 45 * 1000).toISOString(),
        bucketMinutes: 5,
        labels: [pulse.id, ...pulse.tags],
      })),
      score: priorities.length === 0 ? 0.15 : Number((1 / priorities.length).toFixed(4)),
      confidence: graph.audit.topologicalDepth / 10,
      actions,
    };

    const warnings = validatePlan(plan);
    if (warnings.length > 0) {
      this.runHistory.push(`plan:${plan.id}:warn:${warnings.join(',')}`);
    }

    this.store.persistPlan(plan);
    return plan;
  }

  enqueueCommand(plan: SignalPlan, actor: string): SignalCommand {
    const now = new Date().toISOString();
    const command: SignalCommand = {
      id: commandId(plan.id),
      tenantId: plan.tenantId,
      createdAt: now,
      requestedBy: actor,
      planId: plan.id,
      state: 'queued',
      checkpoints: commandLineage(plan, {
        id: '',
        tenantId: plan.tenantId,
        createdAt: now,
        requestedBy: actor,
        planId: plan.id,
        state: 'queued',
        checkpoints: [],
        metadata: {},
      }),
      metadata: {
        actionCount: plan.actions.length,
        score: plan.score,
        confidence: plan.confidence,
      },
    };

    this.store.appendCommand(command);
    this.runHistory.push(`command:${command.id}`);
    return command;
  }

  gatherTelemetry(bundleId: string): ReturnType<typeof telemetry> {
    const result = this.store.getLatestSnapshot(bundleId);
    if (!result.ok) {
      throw result.error;
    }

    return telemetry(result.value);
  }

  recentRuns(): readonly string[] {
    return this.runHistory;
  }

  summarizeRun(bundleId: string): string {
    const summary = buildSignalPulseSummary(bundleId, this.store);
    return `bundle ${bundleId}: ${summary.planCount} plans, ${summary.commandCount} commands`;
  }
}

export const createSignalOrchestrator = (store: SignalStore): RecoverySignalOrchestrator => {
  return new RecoverySignalOrchestrator(store);
};
