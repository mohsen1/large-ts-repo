import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import {
  buildPolicy,
  type ContinuityForecast,
  type ContinuityPolicy,
  type ContinuitySnapshot,
  type ContinuityTenantId,
  type ContinuityWorkspace,
  type ContinuitySnapshotId,
} from '@domain/continuity-lens';
import { assembleWorkspaceSnapshot, synthesizeForecast } from './aggregator';
import { runSimulation } from './simulator';
import { createInMemoryContinuityLensEmitter, type ContinuityLensEmitter } from './adapters';
import {
  type ContinuityIngestionBatch,
  type ContinuityOrchestrationResult,
  type ContinuityWorkspaceSummary,
  type ContinuityLensContext,
  type OrchestratorCommands,
  type ForecastInput,
} from './types';
import { InMemoryContinuityLensStore } from '@data/continuity-lens-store';

const defaultContext = (tenantId: ContinuityTenantId): ContinuityLensContext => ({
  tenantId,
  correlationMode: 'auto',
  maxSignalsPerRun: 200,
});

const toWorkspace = async (
  tenantId: ContinuityTenantId,
  emitter: ContinuityLensEmitter,
  repository: InMemoryContinuityLensStore,
): Promise<Result<ContinuityWorkspace, Error>> => {
  const workspaceSnapshot = await assembleWorkspaceSnapshot(repository, tenantId, 150);
  if (!workspaceSnapshot.ok) return fail(workspaceSnapshot.error);

  const policiesResponse = await repository.listPolicies(tenantId);
  if (!policiesResponse.ok) return fail(policiesResponse.error);

  const policies = policiesResponse.value.map((entry) => entry.policy);
  const snapshotId: ContinuitySnapshotId = withBrand(workspaceSnapshot.value.windowSnapshotId, 'ContinuitySnapshotId');
  return ok({
    tenantId,
    snapshot: {
      id: snapshotId,
      tenantId,
      windowStart: new Date().toISOString(),
      windowEnd: new Date().toISOString(),
      riskScore: workspaceSnapshot.value.riskScore,
      trend: 'flat',
      signals: [],
      programs: [],
    },
    graph: {
      tenantId,
      signalIds: [],
      edges: [],
      orderedByTime: [],
      cycleFree: true,
    },
    forecast: undefined,
    policies,
  });
};

export class RecoveryContinuityLensOrchestrator implements OrchestratorCommands {
  private readonly repository = new InMemoryContinuityLensStore();
  private readonly context: ContinuityLensContext;
  private readonly emitter: ContinuityLensEmitter;

  constructor(tenantId: ContinuityTenantId, options?: Partial<ContinuityLensContext>, emitter?: ContinuityLensEmitter | null) {
    this.context = {
      ...defaultContext(tenantId),
      ...options,
      tenantId,
    };
    this.emitter = emitter ?? createInMemoryContinuityLensEmitter();
  }

  private emit(event: string, message: string): void {
    this.emitter.emit(event, this.context.tenantId, message);
  }

  async loadDefaults(): Promise<void> {
    const defaults: ContinuityPolicy = buildPolicy({
      tenantId: this.context.tenantId,
      name: 'continuity-lens-baseline',
      minimumSeverity: 35,
      criticalityThreshold: 70,
      allowAutoMitigation: true,
      maxConcurrency: 6,
    });
    await this.repository.addPolicy(defaults);
    this.emit('policy.loaded', 'seed baseline policy');
  }

  async ingestBatch(batch: ContinuityIngestionBatch): Promise<Result<ContinuityOrchestrationResult, Error>> {
    const result = await this.repository.addSignals(batch.signals);
    if (!result.ok) return fail(new Error(result.error.message));

    const simulation = runSimulation(this.context.tenantId, result.value, {
      maxCycles: Math.min(3, Math.max(1, Math.floor(batch.signals.length / 4))),
    });
    if (!simulation.ok) return fail(simulation.error);
    const lastSnapshot = simulation.value.snapshots.at(-1);
    if (lastSnapshot) await this.repository.addSnapshot(lastSnapshot);

    const workspaceResult = await this.workspace();
    if (!workspaceResult.ok) return fail(workspaceResult.error);
    await this.repository.addSnapshot({
      ...workspaceResult.value.snapshot,
      id: withBrand(`${batch.tenantId}:last`, 'ContinuitySnapshotId'),
      signals: batch.signals,
    } satisfies ContinuitySnapshot);

    this.emit('batch.ingested', `signals:${batch.signals.length}`);
    return ok({
      runId: withBrand(`${batch.tenantId}:run:${Date.now()}`, 'ContinuityRunId'),
      workspace: workspaceResult.value,
    });
  }

  async forecast(input: ForecastInput): Promise<Result<ContinuityForecast, Error>> {
    const response = await synthesizeForecast(this.repository, this.context.tenantId, input);
    if (!response.ok) return fail(response.error);
    return ok(response.value);
  }

  async workspace(): Promise<Result<ContinuityWorkspace, Error>> {
    const workspaceResult = await toWorkspace(this.context.tenantId, this.emitter, this.repository);
    if (!workspaceResult.ok) return fail(workspaceResult.error);
    return ok(workspaceResult.value);
  }

  async workspaceSummary(): Promise<Result<ContinuityWorkspaceSummary, Error>> {
    const workspaceResult = await this.workspace();
    if (!workspaceResult.ok) return fail(workspaceResult.error);
    return ok({
      tenantId: this.context.tenantId,
      windowId: workspaceResult.value.snapshot.id as string,
      riskScore: workspaceResult.value.snapshot.riskScore,
      signalCount: workspaceResult.value.snapshot.signals.length,
      hasForecast: Boolean(workspaceResult.value.forecast),
    });
  }

  async resetWorkspace(): Promise<void> {
    this.emit('reset', 'workspace reset request');
  }

  async resetTenant(tenantId: ContinuityTenantId): Promise<void> {
    if (tenantId !== this.context.tenantId) return;
    this.emit('reset', `${tenantId} tenant reset`);
  }
}

export const createContinuityLensOrchestrator = (
  tenantId: ContinuityTenantId,
  options?: Partial<ContinuityLensContext>,
  emitter?: ContinuityLensEmitter | null,
): Result<RecoveryContinuityLensOrchestrator, Error> =>
  ok(new RecoveryContinuityLensOrchestrator(tenantId, options, emitter));
