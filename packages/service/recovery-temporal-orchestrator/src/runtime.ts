import {
  bootstrapDefaults,
  type DefaultBundle,
} from '@domain/recovery-temporal-orchestration/defaults';
import {
  createDomainRegistry,
  type TemporalDomainPluginInput,
  type TemporalDomainPluginOutput,
  runPhasesFromRegistry,
} from '@domain/recovery-temporal-orchestration/registry';
import {
  createPlan,
  expandCandidates,
  executeFlow,
  annotatePlan,
  collectPlanSignals,
  type OrchestrationPlan,
} from '@domain/recovery-temporal-orchestration/planner';
import {
  TemporalStore,
  createScopedStore,
  projectStore,
} from '@data/recovery-temporal-store';
import { RuntimeSession, createSession } from './session';
import { TimelineTelemetry } from './telemetry';
import { asFlowNodeId, asStageId, isoNow, type Brand, type StageId } from '@shared/temporal-ops-runtime';

export interface RuntimeOrchestrationOptions {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly actor: string;
  readonly candidateNames: readonly string[];
  readonly planName: string;
}

export interface RuntimeExecution {
  readonly runId: Brand<string, 'RunId'>;
  readonly tenant: string;
  readonly storeProjection: ReturnType<typeof projectStore>;
  readonly phaseSignals: readonly unknown[];
  readonly telemetryCount: number;
}

const runWithStore = async (tenant: Brand<string, 'TenantId'>): Promise<{
  readonly bundle: DefaultBundle;
  readonly store: TemporalStore;
}> => {
  const bundle = await bootstrapDefaults();
  const store = createScopedStore(String(tenant));
  return { bundle, store };
};

const createPlanFromInput = (tenant: Brand<string, 'TenantId'>, planName: string, candidates: readonly string[]) =>
  createPlan(tenant, planName, candidates, { source: 'runtime' });

export const executeOrchestration = async (
  options: RuntimeOrchestrationOptions,
): Promise<RuntimeExecution> => {
  const { bundle, store } = await runWithStore(options.tenant);
  const session = createSession(options.actor, 45_000);
  const telemetry = new TimelineTelemetry();

  await using _session = session;
  const registry = await createDomainRegistry();

  await using _registry = registry;

  const plan = createPlanFromInput(options.tenant, options.planName, options.candidateNames);
  const expanded = expandCandidates(plan.candidates.map((candidate) => candidate.name));
  session.trackPlan({ ...plan, candidates: expanded } as OrchestrationPlan);

  const runbookSeed = createPlan(options.tenant, options.planName, ['bootstrap'], { source: options.actor });
  const runbookStore = store.insert(runbookSeed.runbook);
  const runId = runbookStore.runId;

  const input: TemporalDomainPluginInput = {
    tenant: options.tenant,
    scope: options.planName,
    runbook: runbookSeed.runbook,
  };

  const outputs = await runPhasesFromRegistry(registry, input);
  const terminal = outputs.at(-1)?.runbook;
  if (!terminal) {
    throw new Error(`no terminal runbook for ${String(options.tenant)}`);
  }

  const decorated = annotatePlan(plan, 'complete');
  const audit = collectPlanSignals(decorated);

  store.upsert(terminal, ['completed phases']);
  store.setStatus(terminal.runId, 'complete');

  for (const signal of outputs.flatMap((output) => output.signals)) {
    store.appendSignal(signal);
  }

  for (const signal of audit) {
    // intentionally feed signal payload as telemetry metadata
      telemetry.record('snapshot', 'ok', `audit:${signal.kind}`, String(terminal.runId));
  }

  const phaseSignals = outputs.flatMap((output: TemporalDomainPluginOutput) => output.signals).map((signal) => signal.payload);
  const telemetryCount = telemetry.summarize().length;

  const finalState = session.inspect(plan);
  telemetry.record('verify', finalState.planRuns > 0 ? 'ok' : 'warn', `runs:${finalState.planRuns}`, String(runId));

      await executeFlow(
    {
      runId,
      value: {
        runId,
        plan,
      },
    },
    {
      runId,
      tenant: options.tenant,
      at: isoNow(),
    },
    (builder) => {
      builder.add({
        id: asFlowNodeId('terminal', String(runId)),
        stage: {
          id: asStageId(runId, 'terminal-identity'),
          description: 'terminal-identity',
          tags: new Set(['flow']),
          sequence: 1,
        },
        async run(value: { runId: Brand<string, 'RunId'>; plan: typeof runbookSeed }): Promise<{
          runId: Brand<string, 'RunId'>;
          plan: typeof runbookSeed;
          doneAt: string;
        }> {
          return {
            ...value,
            doneAt: isoNow(),
          };
        },
      });
    },
  );

  return {
    runId: terminal.runId,
    tenant: String(options.tenant),
    storeProjection: projectStore(store),
    phaseSignals,
    telemetryCount,
  };
};

export const executeBatch = async (
  requests: readonly RuntimeOrchestrationOptions[],
): Promise<readonly RuntimeExecution[]> => {
  const runWithDefaultPlan: RuntimeExecution[] = [];
  for (const request of requests) {
    runWithDefaultPlan.push(await executeOrchestration(request));
  }
  return runWithDefaultPlan;
};
