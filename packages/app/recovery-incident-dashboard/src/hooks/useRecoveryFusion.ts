import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import {
  InMemoryFusionStore,
  NoopFusionBus,
  createRecoveryFusionOrchestrator,
  type FusionServiceDeps,
  type FusionPlanCommand,
  type FusionLifecycleEvent,
} from '@service/recovery-fusion-orchestrator';
import {
  FusionBundle,
  parsePlanRequest,
  type FusionBundleId,
  type FusionSignal,
  type FusionWave,
  type FusionPlanRequest,
  type FusionPlanResult,
} from '@domain/recovery-fusion-intelligence';

interface FusionCommand {
  readonly runId: RecoveryRunState['runId'];
  readonly targetWaveId: string;
  readonly command: 'start' | 'pause' | 'resume' | 'abort';
  readonly reason: string;
}

interface UseRecoveryFusionOptions {
  readonly tenant?: string;
  readonly zone?: string;
  readonly owner?: string;
}

interface RecoveryFusionSummary {
  readonly planId: string;
  readonly runId: string;
  readonly bundleCount: number;
  readonly waveCount: number;
  readonly signalCount: number;
  readonly accepted: boolean;
  readonly lastUpdatedAt: string;
}

interface RecoveryFusionState {
  readonly status: 'idle' | 'booting' | 'running' | 'ready' | 'error';
  readonly errors: readonly string[];
  readonly events: readonly FusionLifecycleEvent[];
  readonly plans: readonly RecoveryFusionSummary[];
  readonly waves: readonly FusionWave[];
  readonly signals: readonly FusionSignal[];
}

const asRunId = (value: string): RecoveryRunState['runId'] => value as unknown as RecoveryRunState['runId'];
const asBundleId = (value: string): FusionBundleId => value as unknown as FusionBundleId;

const summarizeBundle = (bundle: FusionBundle, result: FusionPlanResult, updatedAt: string): RecoveryFusionSummary => ({
  planId: bundle.planId as string,
  runId: bundle.runId as string,
  bundleCount: 1,
  waveCount: bundle.waves.length,
  signalCount: bundle.signals.length,
  accepted: result.accepted,
  lastUpdatedAt: updatedAt,
});

const buildRequest = (runId: string, waves: readonly FusionWave[], signals: readonly FusionSignal[]): FusionPlanRequest => ({
  planId: `plan-${runId}` as FusionPlanRequest['planId'],
  runId: asRunId(runId),
  waves,
  signals: signals.map((signal) => ({
    ...signal,
    runId: asRunId(runId),
  })),
  budget: {
    maxParallelism: 4,
    maxRetries: 2,
    timeoutMinutes: 180,
    operatorApprovalRequired: false,
  },
});

const createPlanResult = (request: FusionPlanRequest, waveCount: number): FusionPlanResult => ({
  accepted: true,
  bundleId: `${request.runId}:bundle` as any,
  waveCount,
  estimatedMinutes: Math.max(5, waveCount * 10),
  riskBand: 'green',
  reasons: ['dashboard-simulation'],
});

const toSummary = (bundles: readonly FusionBundle[]): RecoveryFusionSummary[] =>
  bundles.map((bundle) => ({
    planId: String(bundle.planId),
    runId: String(bundle.runId),
    bundleCount: 1,
    waveCount: bundle.waves.length,
    signalCount: bundle.signals.length,
    accepted: true,
    lastUpdatedAt: bundle.createdAt,
  }));

export const useRecoveryFusion = (options: UseRecoveryFusionOptions = {}) => {
  const [tenant, setTenant] = useState(options.tenant ?? 'tenant-01');
  const [zone, setZone] = useState(options.zone ?? 'us-east-1');
  const [status, setStatus] = useState<RecoveryFusionState['status']>('idle');
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [events, setEvents] = useState<readonly FusionLifecycleEvent[]>([]);
  const [plans, setPlans] = useState<readonly RecoveryFusionSummary[]>([]);
  const [waves, setWaves] = useState<readonly FusionWave[]>([]);
  const [signals, setSignals] = useState<readonly FusionSignal[]>([]);

  const store = useMemo(() => new InMemoryFusionStore(), []);
  const bus = useMemo(() => new NoopFusionBus(), []);

  const deps = useMemo<FusionServiceDeps>(
    () => ({
      context: {
        tenant,
        zone,
        owner: options.owner ?? 'dashboard',
        planIdPrefix: 'ui-fusion',
      },
      store,
      bus,
    }),
    [tenant, zone, options.owner, bus, store],
  );

  const orchestrator = useMemo(() => createRecoveryFusionOrchestrator(deps), [deps]);

  const eventFromCommand = (bundleId: string, command: FusionCommand): FusionLifecycleEvent => ({
    eventId: `command:${Date.now()}`,
    eventType: command.command === 'abort' ? 'bundle_closed' : 'wave_started',
    tenant,
    bundleId: asBundleId(bundleId),
    occurredAt: new Date().toISOString(),
    payload: {
      command: command.command,
      targetWaveId: command.targetWaveId,
      reason: command.reason,
    },
  });

  const run = useCallback(async (runIdValue: string, wavesInput: readonly FusionWave[]) => {
    setStatus('booting');
    setErrors([]);
    const request = buildRequest(runIdValue, wavesInput, signals);
    const parsed = parsePlanRequest(request);
    if (!parsed.ok) {
      setErrors((prev) => [...prev, parsed.error.message]);
      setStatus('error');
      return;
    }

    const result = await orchestrator.run(parsed.value);
    if (!result.ok) {
      setErrors((prev) => [...prev, result.error.message]);
      setStatus('error');
      return;
    }

    const updatedAt = new Date().toISOString();
    const planResult = createPlanResult(parsed.value, wavesInput.length);
    setWaves(wavesInput);
    const summary = summarizeBundle(
      {
        id: asBundleId(`${runIdValue}:bundle`) as unknown as FusionBundle['id'],
        tenant,
        runId: parsed.value.runId,
        session: {
          id: `${runIdValue}:session` as any,
          runId: parsed.value.runId,
          ticketId: `${runIdValue}:ticket` as any,
          planId: parsed.value.planId,
          status: 'queued',
          createdAt: updatedAt,
          updatedAt,
          constraints: parsed.value.budget,
          signals: parsed.value.signals,
        },
        planId: parsed.value.planId,
        waves: wavesInput,
        signals: parsed.value.signals,
        createdAt: updatedAt,
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
      planResult,
      updatedAt,
    );

    setPlans((prev) => [...prev, summary]);
    setEvents((prev) => [
      ...prev,
      {
        eventId: `run:${Date.now()}`,
        eventType: 'bundle_closed',
        tenant,
        bundleId: summary.planId as unknown as FusionBundleId,
        occurredAt: updatedAt,
        payload: {
          planId: String(planResult.bundleId),
          runId: runIdValue,
          accepted: planResult.accepted,
        },
      },
    ]);

    setStatus('ready');
  }, [orchestrator, signals, tenant]);

  const command = useCallback(
    async (payload: FusionCommand) => {
      const commandRequest: FusionPlanCommand = {
        runId: payload.runId,
        targetWaveId: payload.targetWaveId,
        command: payload.command,
        requestedAt: new Date().toISOString(),
        reason: payload.reason,
      };

      const commandResult = await orchestrator.command(commandRequest.runId, commandRequest);
      if (!commandResult.ok) {
        setErrors((prev) => [...prev, commandResult.error.message]);
        return;
      }

      setEvents((prev) => [...prev, eventFromCommand(`${commandRequest.runId}`, payload)]);
    },
    [orchestrator, tenant, eventFromCommand],
  );

  const refresh = useCallback(async (runIdValue: string) => {
    const list = await store.list(asRunId(runIdValue));
    setPlans(toSummary(list));
    const metricResult = await orchestrator.metrics(asRunId(runIdValue));
    if (!metricResult.ok) {
      setErrors((prev) => [...prev, metricResult.error.message]);
      return;
    }

    setEvents((prev) => [
      ...prev,
      {
        eventId: `metrics:${Date.now()}`,
        eventType: 'wave_completed',
        tenant,
        bundleId: asBundleId(`${runIdValue}:bundle`),
        occurredAt: new Date().toISOString(),
        payload: {
          metrics: metricResult.value,
        },
      },
    ]);
  }, [orchestrator, store, tenant]);

  useEffect(() => {
    void refresh('run-01');
  }, [refresh]);

  return {
    state: {
      status,
      errors,
      events,
      plans,
      waves,
      signals,
    },
    signals,
    actions: {
      run,
      command,
      refresh,
      setTenant,
      setZone,
      setSignals,
    },
    summary: plans,
    tenant,
    zone,
  };
};
