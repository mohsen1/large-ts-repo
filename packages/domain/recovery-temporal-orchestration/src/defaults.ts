import {
  type EntityId,
  type RunId,
  type StageId,
  asTenantId,
  asEntityId,
  asRunId,
  asStageId,
  isoNow,
} from '@shared/temporal-ops-runtime';
import {
  type TemporalRunbook,
  type OrchestrationSignal,
} from './models';

export interface DefaultBundle<TMeta = unknown> {
  readonly defaultsRunId: RunId;
  readonly labels: {
    readonly label: string;
    readonly scope: string;
    readonly region: string;
  };
  readonly template: TemporalRunbook<TMeta>;
  readonly warmSignals: readonly OrchestrationSignal<'domain', { code: string }>[];
}

export const defaultRegions = ['us-east-1', 'us-west-2', 'eu-west-1'] as const;
export const defaultScopes = ['ops-core', 'ops-edge', 'ops-sim'] as const;
export const defaultSignals = ['start', 'checkpoint', 'close'] as const;

export const bootstrapDefaults = async (): Promise<DefaultBundle> => {
  const defaultsRunId = asRunId('system', `bootstrap:${Date.now()}`);
  const template: TemporalRunbook<Record<string, string>> = {
    runId: defaultsRunId,
    name: 'bootstrap-temporal-runbook',
    tenant: asTenantId('system'),
    scope: `scope:${defaultScopes[0]}`,
    nodes: [],
    edges: [],
    createdAt: isoNow(),
    updatedAt: isoNow(),
    metadata: {
      generatedBy: 'bootstrap',
      generatedAt: isoNow(),
    },
  };

  const warmSignals = defaultSignals.map(
    (signal): OrchestrationSignal<'domain', { code: string }> => ({
      signalId: asEntityId(`sys:${signal}`),
      type: 'signal:domain',
      issuedAt: isoNow(),
      runId: defaultsRunId,
      ttlMs: 5000,
      severity: 'low',
      payload: {
        code: signal,
      },
    }),
  );

  return {
    defaultsRunId,
    labels: {
      label: 'bootstrap-template',
      scope: 'ops-core',
      region: defaultRegions[0],
    },
    template,
    warmSignals,
  };
};

export const createBundleNode = (label: string, runId: RunId, scope: string): StageId => {
  return asStageId(runId, `${label}:${scope}`);
};
