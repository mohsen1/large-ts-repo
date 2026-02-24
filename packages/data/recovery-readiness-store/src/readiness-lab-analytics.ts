import { fail, ok, type Result } from '@shared/result';
import type { ReadinessLabExecutionOutput, ReadinessLabRunId, ReadinessLabWorkspaceModel } from '@domain/recovery-readiness';
import type { ReadinessLabWorkspaceStore, InMemoryReadinessLabWorkspaceStore, ReadinessLabWorkspaceSnapshot } from './readiness-lab-store';

export interface ReadinessLabHealthSlice {
  readonly runId: ReadinessLabRunId;
  readonly score: number;
  readonly signalDensity: number;
  readonly tags: readonly string[];
}

export interface ReadinessLabExecutionAudit {
  readonly workspaceId: ReadinessLabRunId;
  readonly executionCount: number;
  readonly warnings: readonly string[];
  readonly generatedSignals: number;
}

export interface ReadinessLabWorkspaceRank {
  readonly workspaceId: ReadinessLabRunId;
  readonly riskScore: number;
  readonly signalCount: number;
  readonly planCount: number;
}

export class ReadinessLabAnalytics {
  constructor(private readonly store: ReadinessLabWorkspaceStore) {}

  async healthSlices(workspaceIds: ReadonlyArray<ReadinessLabRunId>): Promise<ReadinessLabHealthSlice[]> {
    const workspaces = await Promise.all(workspaceIds.map((id) => this.store.byWorkspace(id)));
    return workspaces.filter((workspace): workspace is ReadinessLabWorkspaceModel => Boolean(workspace)).flatMap((workspace) => {
      const signalDensity = workspace.signalBuckets.reduce((sum, bucket) => sum + bucket.score, 0);
      const totalSignals = workspace.signalBuckets.length;
      const base = workspace.signalBuckets.at(0)?.score ?? 0;
      return [
        {
          runId: workspace.signalBuckets.at(0)?.runId ?? workspace.workspaceId,
          score: Math.min(100, signalDensity + base),
          signalDensity: totalSignals === 0 ? 0 : signalDensity / totalSignals,
          tags: [...workspace.signalBuckets.map((bucket) => bucket.runId as string)],
        },
      ];
    });
  }

  async executionAudits(workspaceIds: ReadonlyArray<ReadinessLabRunId>): Promise<Result<ReadonlyArray<ReadinessLabExecutionAudit>, Error>> {
    const snapshots = await Promise.all(workspaceIds.map(async (workspaceId) => {
      const store = this.store as InMemoryReadinessLabWorkspaceStore | undefined;
      const snapshot = store ? await store.snapshot(workspaceId) : undefined;
      return { workspaceId, snapshot };
    }));

    const audits = snapshots
      .filter(
        (entry): entry is { workspaceId: ReadinessLabRunId; snapshot: ReadinessLabWorkspaceSnapshot } =>
          entry.snapshot?.lastExecution != null,
      )
      .map(({ workspaceId, snapshot }) => {
        const lastExecution = snapshot.lastExecution;
        if (!lastExecution) {
          throw new Error('workspace-last-execution-missing');
        }

        const warnings = lastExecution.warnings ?? [];
        const generatedSignals = lastExecution.generatedSignals.length;
        return {
          workspaceId,
          executionCount: 1,
          warnings,
          generatedSignals,
        } satisfies ReadinessLabExecutionAudit;
      });

    return audits.length === 0 ? fail(new Error('no-workspaces')) : ok(audits);
  }

  rankWorkspace(workspaceIds: ReadonlyArray<ReadinessLabRunId>): ReadinessLabWorkspaceRank[] {
    const runIds = new Set<ReadinessLabRunId>(workspaceIds);
    const rows = [...runIds];
    const ranked = rows
      .map((workspaceId) => {
        const planCount = workspaceId.toString().length;
        const signalCount = workspaceId.length;
        const riskScore = Math.max(0, 100 - planCount * signalCount);
        return { workspaceId, riskScore, signalCount, planCount };
      })
      .sort((left, right) => right.riskScore - left.riskScore);

    return ranked;
  }
}
