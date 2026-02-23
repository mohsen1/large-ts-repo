import type { ForgeRunId } from '@domain/recovery-command-forge';

export type ForgeWorkspaceId = string & { readonly __brand: 'RecoveryForgeWorkspaceId' };
export type ForgeRunPlanId = ForgeRunId;

export interface ForgeWorkspace {
  readonly workspaceId: ForgeWorkspaceId;
  readonly tenant: string;
  readonly summary: {
    readonly totalRuns: number;
    readonly successfulRuns: number;
    readonly failedRuns: number;
    readonly averagePolicyScore: number;
  };
  readonly envelopes: readonly {
    readonly runId: ForgeRunPlanId;
    readonly tenant: string;
    readonly budgetWindowMinutes: number;
    readonly summary: string;
    readonly policyScore: number;
    readonly constraintCount: number;
  }[];
  readonly lastUpdatedAt: string;
}

export interface ForgeWorkspaceFilters {
  readonly tenant: string | undefined;
  readonly minPolicyScore: number;
  readonly onlyBlocked: boolean;
}

export interface ForgeWorkspaceState {
  readonly workspace: ForgeWorkspace | undefined;
  readonly loading: boolean;
  readonly errors: readonly string[];
}
