import { useEffect, useMemo, useReducer } from 'react';
import type { PluginPayload, QuantumInput, QuantumOutput, QuantumRunId, QuantumSessionId, QuantumTenantId, SignalMeta } from '../types';
import { asBrand } from '@shared/typed-orchestration-core/brands';
import { runQuantumSuite, type QuantumRunConfig, type QuantumOrchestrationOutcome } from '../services/orchestrator';
import { summarizeSignals, isCritical, makeRunId, makeTenantId } from '../types';

type SuiteState = {
  readonly status: 'idle' | 'running' | 'ready' | 'error';
  readonly tenant: QuantumTenantId;
  readonly session: QuantumSessionId | null;
  readonly runId: QuantumRunId | null;
  readonly output: QuantumOutput | null;
  readonly diagnostics: readonly string[];
  readonly error: string | null;
};

type SuiteAction =
  | { type: 'start'; tenant: QuantumTenantId; session: QuantumSessionId; runId: QuantumRunId }
  | { type: 'running' }
  | { type: 'succeeded'; output: QuantumOutput }
  | { type: 'error'; message: string }
  | { type: 'set-diagnostics'; diagnostics: readonly string[] }
  | { type: 'set-output'; output: QuantumOutput };

const initialState: SuiteState = {
  status: 'idle',
  tenant: asBrand('tenant-default', 'TenantId'),
  session: null,
  runId: null,
  output: null,
  diagnostics: [],
  error: null,
};

const suiteReducer = (state: SuiteState, action: SuiteAction): SuiteState => {
  switch (action.type) {
    case 'start': {
      return {
        ...state,
        tenant: action.tenant,
        session: action.session,
        runId: action.runId,
        status: 'running',
        output: null,
        error: null,
      };
    }
    case 'running':
      return { ...state, status: 'running' };
    case 'succeeded':
      return { ...state, status: 'ready', output: action.output };
    case 'error':
      return { ...state, status: 'error', error: action.message };
    case 'set-diagnostics':
      return { ...state, diagnostics: action.diagnostics };
    case 'set-output':
      return { ...state, output: action.output };
    default:
      return state;
  }
};

const summarizeOutput = (value: QuantumOutput): readonly string[] => {
  const dependencies = value.directives.flatMap((entry) => entry.dependencies);
  return [
    `status=${value.status}`,
    `summary=${value.summary}`,
    `stages=${value.stages.length}`,
    `deps=${dependencies.length}`,
  ];
};

const computeSignalBuckets = (input: QuantumInput) => {
  const [critical, stable] = [
    summarizeSignals(input.signals.values).ordered.filter(isCritical),
    summarizeSignals(input.signals.values).ordered.filter((value) => !isCritical(value)),
  ];
  return {
    criticalCount: critical.length,
    stableCount: stable.length,
    totalWeight: summarizeSignals(input.signals.values).score,
  };
};

const buildPayload = (tenant: QuantumTenantId, payload: QuantumInput, runId: QuantumRunId): PluginPayload => {
  const commandFor = (weight: SignalMeta['weight']) => (weight === 'critical' || weight === 'high' ? 'throttle' : 'synchronize');
  return {
    output: {
      runId,
      executedAt: new Date().toISOString(),
      summary: `summary:${runId}`,
      stages: [
        {
          stage: 'stage:input',
          stageRunId: runId,
          directives: payload.signals.values.slice(0, 2).map((signal, index) => ({
            id: `directive:${runId}:${index}`,
            command: commandFor(signal.weight),
            reason: `${signal.actor}:${signal.channel}`,
            priority: index + 1,
            dependencies: payload.signals.values.map((entry) => entry.id),
            expiresAt: new Date(Date.now() + payload.budgetMs).toISOString(),
          })),
          artifactPayload: {
            source: tenant,
            size: payload.signals.values.length,
          },
        },
      ],
      directives: payload.signals.values.map((signal) => ({
        id: `directive:${signal.id}`,
        command: 'synchronize',
        reason: signal.kind,
        priority: 1,
        dependencies: [signal.channel],
      })),
      status: 'ok',
    },
    input: payload,
    markers: [],
  };
};

export const useQuantumControlSuite = (
  tenantId: QuantumTenantId,
  runConfig: QuantumRunConfig = {},
): {
  readonly state: SuiteState;
  readonly launch: (payload: QuantumInput) => Promise<void>;
  readonly refreshOutput: (payload: QuantumInput) => Promise<void>;
  readonly buckets: ReturnType<typeof computeSignalBuckets>;
  readonly seedPayload: PluginPayload;
  readonly isBusy: boolean;
  readonly seededSignals: readonly SignalMeta[];
} => {
  const [state, dispatch] = useReducer(suiteReducer, initialState);
  const tenant = tenantId;

  const buckets = useMemo(() => {
    const fallbackInput: QuantumInput = {
      runId: makeRunId('run-empty'),
      tenant,
      shape: 'adaptive',
      stage: 'stage:seed',
      signals: {
        id: 'envelope-seed',
        runId: makeRunId('run-empty'),
        recordedAt: new Date().toISOString(),
        values: [],
      },
      budgetMs: 320,
    };
    return computeSignalBuckets(fallbackInput);
  }, [tenant]);

  const seedPayload = useMemo(() => {
    const base: QuantumInput = {
      runId: makeRunId('run-seed'),
      tenant,
      shape: 'linear',
      stage: 'stage:seed',
      signals: {
        id: 'envelope-seed',
        runId: makeRunId('run-seed'),
        recordedAt: new Date().toISOString(),
        values: [],
      },
      budgetMs: 220,
    };
    return buildPayload(tenant, base, makeRunId('run-seed'));
  }, [tenant]);

  const seededSignals = useMemo(() => [...seedPayload.input.signals.values], [seedPayload]);

  const isBusy = state.status === 'running';

  useEffect(() => {
    dispatch({
      type: 'set-diagnostics',
      diagnostics: buckets.totalWeight ? ['initialized', `seed=${tenant}`] : ['initialized'],
    });
  }, [buckets.totalWeight, tenant]);

  const launch = async (payload: QuantumInput): Promise<void> => {
    const runId = makeRunId(`run-${Date.now()}`);
    const session = asBrand(`session-${runId}`, 'SessionId') as QuantumSessionId;
    dispatch({ type: 'start', tenant, session, runId });
    dispatch({ type: 'running' });

    try {
      const outcome = await runQuantumSuite(tenant, payload, runConfig);
      dispatch({
        type: 'set-diagnostics',
        diagnostics: outcome.diagnostics.map((entry) => `${entry.event}:${entry.severity}`),
      });
      dispatch({ type: 'succeeded', output: outcome.run.output });
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const refreshOutput = async (payload: QuantumInput): Promise<void> => {
    const run = await runQuantumSuite(tenant, payload, { ...runConfig, includeAdapters: true, tenant });
    const output = run.run.output;
    dispatch({ type: 'set-output', output });
    dispatch({ type: 'set-diagnostics', diagnostics: summarizeOutput(output) });
  };

  return { state, launch, refreshOutput, buckets, seedPayload, isBusy, seededSignals };
};
