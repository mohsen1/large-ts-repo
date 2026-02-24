import { fail, ok, type Result } from '@shared/result';
import type { NoInfer } from '@shared/type-level';
import type { ReadinessLabRunId, ReadinessLabWorkspaceModel, ReadinessLabSignalEnvelope } from '@domain/recovery-readiness/readiness-lab-core';
import type { ReadinessLabExecutionOutput } from '@domain/recovery-readiness/readiness-lab-core';
import type { ReadinessSignal } from '@domain/recovery-readiness';
import { InMemoryLabEventLog } from './readiness-lab-events';

export interface ReadinessLabWorkspaceRow {
  readonly workspaceId: ReadinessLabRunId;
  readonly tenant: string;
  readonly namespace: ReadinessLabWorkspaceModel['namespace'];
  readonly runIds: ReadonlyArray<ReadinessLabRunId>;
  readonly signals: ReadonlyArray<ReadinessSignal>;
  readonly executionCount: number;
}

export interface ReadinessLabWorkspaceSnapshot {
  readonly workspace: ReadinessLabWorkspaceModel;
  readonly rows: ReadonlyArray<ReadinessLabWorkspaceRow>;
  readonly lastExecution: ReadinessLabExecutionOutput | undefined;
}

export interface ReadinessLabWorkspaceMetrics {
  readonly workspaceCount: number;
  readonly runCount: number;
  readonly signalCount: number;
  readonly averageSignalsPerRun: number;
}

export interface ReadinessLabWorkspaceStore {
  upsert(workspace: NoInfer<ReadinessLabWorkspaceModel>): Promise<Result<void, Error>>;
  byWorkspace(workspaceId: NoInfer<ReadinessLabWorkspaceModel['workspaceId']>): Promise<ReadinessLabWorkspaceModel | undefined>;
  removeWorkspace(workspaceId: ReadinessLabWorkspaceModel['workspaceId']): Promise<Result<void, Error>>;
  listWorkspaceIds(): Promise<ReadinessLabWorkspaceModel['workspaceId'][]>;
  listAll(): Promise<ReadonlyArray<ReadinessLabWorkspaceModel>>;
  appendExecution(
    workspaceId: ReadinessLabWorkspaceModel['workspaceId'],
    execution: ReadinessLabExecutionOutput,
  ): Promise<void>;
  metrics(): Promise<ReadinessLabWorkspaceMetrics>;
}

export class InMemoryReadinessLabWorkspaceStore implements ReadinessLabWorkspaceStore, AsyncDisposable {
  readonly #workspaces = new Map<ReadinessLabWorkspaceModel['workspaceId'], ReadinessLabWorkspaceModel>();
  readonly #runs = new Map<ReadinessLabWorkspaceModel['workspaceId'], Set<ReadinessLabRunId>>();
  readonly #signalLog = new InMemoryLabEventLog<ReadinessLabExecutionOutput>();
  readonly #executions = new Map<ReadinessLabWorkspaceModel['workspaceId'], ReadinessLabExecutionOutput[]>();
  #closed = false;

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.#closed = true;
  }

  async upsert(workspace: NoInfer<ReadinessLabWorkspaceModel>): Promise<Result<void, Error>> {
    if (this.#closed) {
      return fail(new Error('workspace-store-closed'));
    }

    this.#workspaces.set(workspace.workspaceId, workspace);
    const previous = this.#runs.get(workspace.workspaceId);
    if (!previous) {
      const runSet = new Set<ReadinessLabRunId>(workspace.signalBuckets.map((bucket) => bucket.runId));
      this.#runs.set(workspace.workspaceId, runSet);
    }

    return ok(undefined);
  }

  async byWorkspace(workspaceId: NoInfer<ReadinessLabWorkspaceModel['workspaceId']>): Promise<ReadinessLabWorkspaceModel | undefined> {
    const workspace = this.#workspaces.get(workspaceId as ReadinessLabWorkspaceModel['workspaceId']);
    return workspace;
  }

  async removeWorkspace(workspaceId: ReadinessLabWorkspaceModel['workspaceId']): Promise<Result<void, Error>> {
    if (!this.#workspaces.has(workspaceId)) {
      return fail(new Error('workspace-missing'));
    }

    this.#workspaces.delete(workspaceId);
    this.#runs.delete(workspaceId);
    this.#executions.delete(workspaceId);
    return ok(undefined);
  }

  async listWorkspaceIds(): Promise<ReadinessLabWorkspaceModel['workspaceId'][]> {
    return [...this.#workspaces.keys()];
  }

  async listAll(): Promise<ReadonlyArray<ReadinessLabWorkspaceModel>> {
    return [...this.#workspaces.values()];
  }

  async appendExecution(workspaceId: ReadinessLabWorkspaceModel['workspaceId'], execution: ReadinessLabExecutionOutput): Promise<void> {
    const current = this.#executions.get(workspaceId) ?? [];
    this.#executions.set(workspaceId, [...current, execution]);
    this.#signalLog.write(execution.runId, {
      envelopeId: execution.runId,
      namespace: `${execution.runId}:readiness-lab` as ReadinessLabSignalEnvelope<ReadinessLabExecutionOutput>['namespace'],
      runId: execution.runId,
      planId: execution.planId,
      version: 1,
      payload: execution,
    } satisfies ReadinessLabSignalEnvelope<ReadinessLabExecutionOutput>);
  }

  async snapshot(workspaceId: ReadinessLabWorkspaceModel['workspaceId']): Promise<ReadinessLabWorkspaceSnapshot | undefined> {
    const workspace = this.#workspaces.get(workspaceId);
    if (!workspace) {
      return undefined;
    }

    const rows = await Promise.all(
      [...(this.#runs.get(workspaceId) ?? new Set()).values()].map(async (runRunId) => ({
        workspaceId,
        tenant: workspace.tenant,
        namespace: workspace.namespace,
        runIds: [runRunId],
        signals: [],
        executionCount: this.#executions.get(workspaceId)?.length ?? 0,
      })),
    );

    return {
      workspace,
      rows,
      lastExecution: this.#executions.get(workspaceId)?.at(-1),
    };
  }

  async metrics(): Promise<ReadinessLabWorkspaceMetrics> {
    const workspaces = [...this.#workspaces.values()];
    const runCount = [...this.#runs.values()].reduce((acc, runSet) => acc + runSet.size, 0);
    const signals = [...this.#runs.values()].reduce((acc, runSet) => acc + runSet.size, 0);
    return {
      workspaceCount: workspaces.length,
      runCount,
      signalCount: signals,
      averageSignalsPerRun: workspaceCount(workspaces) > 0 ? signals / Math.max(1, runCount) : 0,
    };
  }
}

const workspaceCount = (workspaces: readonly ReadinessLabWorkspaceModel[]): number => workspaces.length;
