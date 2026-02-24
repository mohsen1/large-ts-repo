import type {
  OrchestratorHints,
  OrchestratorInput,
  ProfileHint,
  RecoveryWorkflow,
  TenantScope,
  Stage,
} from './types';

const STAGES: readonly Stage[] = ['ingest', 'plan', 'simulate', 'execute', 'observe', 'finalize'];

export interface RuntimeManifestSchema {
  readonly tenantDefaults: readonly ProfileHint[];
  readonly operatorDefaults: readonly ProfileHint[];
  readonly globalDefaults: readonly ProfileHint[];
  readonly bootstrapMs: number;
}

export interface RuntimeManifestPayload {
  readonly tenantDefaults: readonly ProfileHint[];
  readonly operatorDefaults: readonly ProfileHint[];
  readonly globalDefaults: readonly ProfileHint[];
  readonly bootstrapMs: number;
}

export const defaultManifest: RuntimeManifestSchema = {
  tenantDefaults: [],
  operatorDefaults: [],
  globalDefaults: [],
  bootstrapMs: 25,
};

export const createFallbackProfile = (profileId: string): ProfileHint => ({
  profileId: profileId as ProfileHint['profileId'],
  profileName: profileId,
  strictness: 5,
  tags: ['fallback'],
} satisfies ProfileHint);

export const parseHints = (raw: unknown): OrchestratorHints => {
  const base = raw as Partial<OrchestratorHints>;
  return {
    dryRun: Boolean(base.dryRun),
    trace: base.trace !== false,
    timeoutMs: typeof base.timeoutMs === 'number' ? base.timeoutMs : 1500,
    parallelism: (base.parallelism === 1 || base.parallelism === 2 || base.parallelism === 4 || base.parallelism === 8)
      ? base.parallelism
      : 2,
  } satisfies OrchestratorHints;
};

export const parseWorkflow = (raw: unknown): RecoveryWorkflow => {
  const source = raw as RecoveryWorkflow;
  return {
    id: source.id,
    tenantId: source.tenantId,
    incidentId: source.incidentId,
    runId: source.runId,
    graphLabel: source.graphLabel,
    stages: source.stages?.length ? source.stages : STAGES,
    targetWindowMinutes: Number(source.targetWindowMinutes || 15),
    tags: source.tags ?? [],
    signals: source.signals ?? [],
  };
};

export const parseInput = (raw: unknown): OrchestratorInput => {
  const source = raw as OrchestratorInput;
  return {
    workflow: parseWorkflow(source.workflow),
    requestedPlugins: source.requestedPlugins ?? [],
    limit: Number(source.limit || 1),
    allowParallel: Boolean(source.allowParallel),
    profile: source.profile,
  };
};

export const parseTenantScope = (tenantId: string, incidentId: string): TenantScope => ({
  tenantId: tenantId as TenantScope['tenantId'],
  incidentId: incidentId as TenantScope['incidentId'],
});
