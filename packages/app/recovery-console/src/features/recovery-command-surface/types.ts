import type { SurfacePlan, SurfaceRun, SimulationResult, SurfaceForecast } from '@domain/recovery-command-surface-models';

export interface RecoveryCommandSurfaceWorkspace {
  readonly tenant: string;
  readonly scopeLabel: string;
  readonly plans: readonly SurfacePlan[];
  readonly runs: readonly SurfaceRun[];
  readonly selectedPlanId: string | null;
  readonly selectedRunId: string | null;
  readonly running: boolean;
}

export interface RecoveryCommandSurfaceFilters {
  readonly tenant?: string;
  readonly planId?: string;
  readonly runState?: SurfaceRun['state'];
}

export interface SimulationProjection {
  readonly planId: string;
  readonly runId: string;
  readonly forecast: SimulationResult | undefined;
  readonly projection: SurfaceForecast | undefined;
}
