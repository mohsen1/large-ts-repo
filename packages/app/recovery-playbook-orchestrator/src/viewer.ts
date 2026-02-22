import type { RecoveryPlanExecution } from '@domain/recovery-playbooks';

export interface PlaybookManifest {
  items: {
    id: string;
    status: RecoveryPlanExecution['status'];
    operator: string;
    steps: number;
    startedAt?: string;
  }[];
  nextCursor: string;
  total: number;
}

export const describePlaybooks = (runs: readonly RecoveryPlanExecution[]): PlaybookManifest => ({
  items: runs.map((run) => ({
    id: run.id,
    status: run.status,
    operator: run.operator,
    steps: run.selectedStepIds.length,
    startedAt: run.startedAt,
  })),
  nextCursor: '',
  total: runs.length,
});
