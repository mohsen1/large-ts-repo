import type { RouteCatalogUnion } from '@shared/type-level/stress-orchestrator-mesh';

export type StressCommandMode =
  | 'configure'
  | 'inspect'
  | 'simulate'
  | 'execute'
  | 'review'
  | 'archive';

export type StressCommandRoute = RouteCatalogUnion;

export interface RouteCommand {
  readonly id: `cmd-${string}`;
  readonly route: StressCommandRoute;
  readonly mode: StressCommandMode;
  readonly priority: number;
  readonly tags: readonly string[];
}

export interface RouteCommandEnvelope {
  readonly command: RouteCommand;
  readonly createdAt: Date;
  readonly payload: unknown;
}

export interface StressStudioCommandPlan {
  readonly tenant: string;
  readonly profile: {
    readonly defaultPriority: number;
    readonly includeReplay: boolean;
  };
  readonly commands: readonly RouteCommand[];
}

export interface StressStudioRuntimeState {
  readonly tenant: string;
  readonly running: boolean;
  readonly runId: string;
  readonly refreshToken: number;
  readonly commands: readonly RouteCommand[];
  readonly mode: StressCommandMode;
  readonly progress: number;
}

export interface StressStudioSnapshot {
  readonly commandCount: number;
  readonly averagePriority: number;
  readonly hasReplay: boolean;
  readonly routeDensity: number;
  readonly lastUpdated: number;
}

export interface StressStudioResult {
  readonly route: RouteCatalogUnion;
  readonly accepted: boolean;
  readonly status: 'idle' | 'queued' | 'applied';
  readonly message: string;
}

export interface StressCommandCatalog {
  readonly labels: readonly string[];
  readonly routes: Readonly<Record<string, StressCommandRoute>>;
}

export type BranchBucket = {
  readonly command: string;
  readonly route: StressCommandRoute;
  readonly routeDensity: number;
};

export interface StressStudioBuckets {
  readonly low_bucket: readonly BranchBucket[];
  readonly medium_bucket: readonly BranchBucket[];
  readonly high_bucket: readonly BranchBucket[];
  readonly urgent_bucket: readonly BranchBucket[];
}

export const defaultModeOrder: readonly StressCommandMode[] = [
  'configure',
  'inspect',
  'simulate',
  'execute',
  'review',
  'archive',
] as const;

export const defaultProfile = (tenant: string) =>
  ({
    tenant,
    mode: 'configure',
    defaultPriority: 5,
    includeReplay: true,
    buckets: { low_bucket: [], medium_bucket: [], high_bucket: [], urgent_bucket: [] },
  }) as const;

export type StudioCatalog = ReturnType<typeof defaultProfile>;

export interface DispatchTrace {
  readonly id: number;
  readonly step: string;
  readonly commandId: string;
  readonly route: StressCommandRoute;
  readonly accepted: boolean;
}

export interface CommandWorkbenchState {
  readonly tenant: string;
  readonly activeMode: StressCommandMode;
  readonly route: StressCommandRoute | null;
  readonly selectedCommand: string | null;
  readonly runToken: number;
  readonly trace: readonly DispatchTrace[];
}
