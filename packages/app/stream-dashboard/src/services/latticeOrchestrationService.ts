import {
  asRunId,
  asStreamId,
  asRegionId,
  asTenantId,
  asZoneId,
  buildPlanRuntime,
  makeSessionConfig,
  makeTraceId,
  type LatticeContext,
  type StageDefinition,
  type StageKind,
  withLatticeSession,
} from '@domain/recovery-lattice';
import {
  createLatticeStoreFacade,
  describeSignals,
  type IngestBatchPayload,
  type LatticeBatchRequest,
  type LatticeMode,
  type LatticeQuery,
  type LatticeSignalEvent,
  blankTopology,
  validateBatch,
  validateSignalSafe,
} from '@data/recovery-lattice-store';

export interface LatticeExecutionContext {
  readonly tenant: string;
  readonly streamId: string;
  readonly mode: LatticeMode;
  readonly namespace: string;
}

export interface LatticeEventPayload {
  readonly tenant: string;
  readonly streamId: string;
  readonly events: readonly unknown[];
}

export interface LatticeExecutionResult {
  readonly runId: ReturnType<typeof asRunId>;
  readonly accepted: number;
  readonly rejected: number;
  readonly snapshotId: string;
  readonly windowId: string;
  readonly alerts: readonly string[];
  readonly report: string;
}

export interface LatticeAuditRow {
  readonly id: string;
  readonly path: string;
  readonly mode: LatticeMode;
  readonly score: number;
}

export type { LatticeMode };

const normalizeMode = (value: string): LatticeMode => {
  if (value === 'simulation' || value === 'stress' || value === 'drill') {
    return value;
  }
  return 'analysis';
};

export const buildLatticePlanPayload = async (
  context: LatticeExecutionContext,
  events: readonly LatticeSignalEvent[],
): Promise<LatticeBatchRequest> => {
  const normalized = await validateBatch({
    tenantId: context.tenant,
    streamId: context.streamId,
    topology: blankTopology(context.streamId),
    records: events,
    tags: [context.mode, context.namespace],
  });
  if (!normalized.ok) {
    throw new Error(normalized.error);
  }
  return normalized.value;
};

export const validateLatticeSignals = (signals: readonly unknown[]): readonly LatticeSignalEvent[] => {
  const normalized = signals
    .map((signal, index) => {
      const parsed = validateSignalSafe(signal);
      if (!parsed.ok) {
        return null;
      }

      return {
        ...parsed.value,
        tenantId: asTenantId(parsed.value.tenantId),
        zoneId: asZoneId(parsed.value.zoneId),
        streamId: asStreamId(parsed.value.streamId),
        details: {
          ...parsed.value.details,
          source: 'ui-ingest',
          sourceIndex: index,
        } as LatticeSignalEvent['details'],
      } as LatticeSignalEvent;
    });

  return normalized.filter((signal): signal is LatticeSignalEvent => signal !== null);
};

export const runLatticeIngestion = async (
  context: LatticeExecutionContext,
  payload: LatticeEventPayload,
): Promise<LatticeExecutionResult> => {
  const tenantId = asTenantId(payload.tenant);
  const mode = normalizeMode(context.mode);
  const events = validateLatticeSignals(payload.events);
  const request = await buildLatticePlanPayload(
    {
      tenant: context.tenant,
      streamId: context.streamId,
      mode,
      namespace: `${context.namespace}:${mode}`,
    },
    events,
  );

  const facade = createLatticeStoreFacade();
  try {
    await withLatticeSession(makeSessionConfig(tenantId), async () => Promise.resolve());

    const result = await facade.ingest({
      tenantId: request.tenantId as string,
      streamId: request.streamId as string,
      topology: request.topology,
      payload: request.records,
    } as IngestBatchPayload);

    if (!result.ok) {
      throw new Error(result.error);
    }

    const alerts = await facade.alerts({
      tenantId: request.tenantId,
      streamId: request.streamId,
    });
    const report = await facade.report({
      tenantId: request.tenantId,
      streamId: request.streamId,
    });

    return {
      runId: asRunId(`${tenantId}:${Date.now().toString(36)}`),
      accepted: result.value.accepted,
      rejected: result.value.rejected,
      snapshotId: result.value.snapshotId,
      windowId: result.value.windowId,
      alerts,
      report,
    };
  } finally {
    await facade.dispose();
  }
};

export const inspectLatticeSignals = async (
  query: LatticeQuery,
): Promise<{ readonly envelope: ReturnType<typeof describeSignals>; readonly audits: LatticeAuditRow[] }> => {
  const facade = createLatticeStoreFacade();
  try {
    const timelines = await facade.query(query);
    const alerts = await facade.alerts(query);
    const envelope = describeSignals(timelines.flatMap((entry) => entry.events));
    const tenantToken = String(query.tenantId ?? 'tenant://unknown');
    const audits = alerts.map((entry, index) => {
      const [streamId = 'stream://unknown', tag = 'analysis', score = '0'] = entry.split(':');
      return {
        id: `audit:${tenantToken}:${streamId}:${index}`,
        path: `/${tenantToken}/${streamId}`,
        mode: normalizeMode(tag),
        score: Number(score),
      };
    });

    return { envelope, audits };
  } finally {
    await facade.dispose();
  }
};

export const executeLatticePlan = async (
  tenant: string,
  runId: string,
  context: LatticeExecutionContext,
): Promise<{ readonly runId: string; readonly trace: readonly LatticeSignalEvent[] }> => {
  const contextEnvelope: LatticeContext = {
    tenantId: asTenantId(tenant),
    regionId: asRegionId(`region:${tenant}`),
    zoneId: asZoneId(`zone:${tenant}`),
    requestId: makeTraceId(`trace:${tenant}`),
  };

  const plan = buildPlanRuntime(
    asTenantId(tenant),
    [] as unknown as readonly StageDefinition<LatticeContext, StageKind>[],
    contextEnvelope,
  );
  await withLatticeSession(makeSessionConfig(asTenantId(tenant)), async () => {
    await Promise.resolve(plan.id);
  });

  return {
    runId,
    trace: [
      {
        tenantId: asTenantId(context.tenant),
        zoneId: asZoneId(`zone://${context.tenant}`),
        streamId: asStreamId(context.streamId),
        level: 'normal',
        score: 0.22,
        at: new Date().toISOString(),
        details: {
          runId,
          source: 'runtime-plan',
        },
      },
    ],
  };
};
