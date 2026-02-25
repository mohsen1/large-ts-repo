export type RecoveryWorkbenchRoute = 'route:ingest' | 'route:transform' | 'route:score' | 'route:publish' | 'route:all';

export interface WorkbenchSnapshot {
  readonly tenant: string;
  readonly workspace: string;
  readonly runId: string;
  readonly status: 'idle' | 'running' | 'success' | 'failed';
  readonly stage: string;
  readonly elapsedMs: number;
  readonly score?: number;
  readonly timeline: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface WorkbenchPluginResult {
  readonly id: string;
  readonly name: string;
  readonly route: RecoveryWorkbenchRoute;
  readonly value: string;
  readonly confidence: number;
  readonly latencyMs: number;
}

export interface WorkbenchControlState {
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly snapshots: readonly WorkbenchSnapshot[];
  readonly selectedRoute: RecoveryWorkbenchRoute;
  readonly results: readonly WorkbenchPluginResult[];
}
