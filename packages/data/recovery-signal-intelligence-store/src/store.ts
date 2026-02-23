import { Result, ok, fail } from '@shared/result';
import {
  type SignalBundle,
  type SignalFeedSnapshot,
  type SignalPulse,
  type SignalPlan,
  type SignalCommand,
  type SignalPriority,
  buildPriorities,
  aggregateByDimension,
} from '@domain/recovery-signal-intelligence';

export class SignalStore {
  private readonly bundleIndex = new Map<string, SignalBundle>();
  private readonly snapshots = new Map<string, SignalFeedSnapshot>();
  private readonly plans = new Map<string, SignalPlan>();
  private readonly commands = new Map<string, SignalCommand>();

  upsertBundle(bundle: SignalBundle): Result<void, Error> {
    if (bundle.pulses.length === 0) {
      return fail(new Error('bundle has no pulses'));
    }

    this.bundleIndex.set(bundle.id, bundle);
    return ok(undefined);
  }

  getBundle(bundleId: string): Result<SignalBundle, Error> {
    const bundle = this.bundleIndex.get(bundleId);
    if (!bundle) {
      return fail(new Error(`missing bundle ${bundleId}`));
    }
    return ok(bundle);
  }

  buildSnapshot(bundleId: string): Result<SignalFeedSnapshot, Error> {
    const bundleResult = this.getBundle(bundleId);
    if (!bundleResult.ok) {
      return fail(bundleResult.error);
    }

    const bundle = bundleResult.value;
    const snapshot: SignalFeedSnapshot = {
      facilityId: bundle.pulses[0]?.facilityId ?? 'unknown',
      tenantId: bundle.tenantId,
      asOf: new Date().toISOString(),
      pulses: bundle.pulses,
      priorities: buildPriorities({
        facilityId: bundle.pulses[0]?.facilityId ?? 'unknown',
        tenantId: bundle.tenantId,
        asOf: new Date().toISOString(),
        pulses: bundle.pulses,
        priorities: [],
        intensityByDimension: aggregateByDimension(bundle.pulses),
      }),
      intensityByDimension: aggregateByDimension(bundle.pulses),
    };

    this.snapshots.set(bundleId, snapshot);
    return ok(snapshot);
  }

  getLatestSnapshot(bundleId: string): Result<SignalFeedSnapshot, Error> {
    const snapshot = this.snapshots.get(bundleId);
    if (!snapshot) {
      return fail(new Error(`snapshot not ready for ${bundleId}`));
    }
    return ok(snapshot);
  }

  persistPlan(plan: SignalPlan): void {
    this.plans.set(plan.id, plan);
  }

  listPlans(): SignalPlan[] {
    return [...this.plans.values()];
  }

  appendCommand(command: SignalCommand): void {
    this.commands.set(command.id, command);
  }

  listCommands(facilityId?: string): SignalCommand[] {
    const all = [...this.commands.values()];
    if (!facilityId) {
      return all;
    }
    return all.filter((command) => command.tenantId === facilityId);
  }

  snapshotForFacility(facilityId: string): SignalFeedSnapshot[] {
    return [...this.snapshots.values()].filter((snapshot) => snapshot.facilityId === facilityId);
  }

  getPulses(bundleId: string): SignalPulse[] {
    const bundle = this.bundleIndex.get(bundleId);
    return bundle?.pulses ?? [];
  }
}
