import {
  type Brand,
  baseTemplate,
  buildHorizonLabel,
  type HorizonIdentity,
  type HorizonMetric,
  type HorizonStage,
  type HorizonSnapshot,
  type HorizonTemplate,
  type HorizonWorkspaceId,
  type StageChain,
} from '@domain/recovery-stress-lab';
import {
  HorizonIncidentProjectionStore,
  type HorizonProjectionEnvelope,
  type ProjectionStoreRepository,
} from '@data/recovery-incident-lab-store';
import { InMemoryHorizonTimeseries } from '@data/recovery-incident-lab-store/src/horizon-incident-timeseries';
import { buildDefaultLattice, type PluginRunRecord } from './horizon-plugin-lattice';
import { err, ok, type Result } from '@shared/result';

export interface StageOutput {
  readonly index: number;
  readonly pluginId: string;
  readonly output: string;
  readonly durationMs: number;
  readonly route: string;
}

export type StageEvent = {
  readonly timestamp: string;
  readonly stage: HorizonStage;
  readonly pluginId: string;
  readonly durationMs: number;
  readonly output: string;
};

export interface EngineOptions<TInput> {
  readonly identity: HorizonIdentity;
  readonly template: HorizonTemplate;
  readonly tenant: string;
  readonly payload: TInput;
}

export interface EngineRunState {
  readonly tenant: string;
  readonly workspaceId: HorizonWorkspaceId;
  readonly runId: Brand<string, 'HorizonRunId'>;
  readonly route: StageChain;
  readonly startedAt: string;
  readonly stage: HorizonStage;
}

export interface EngineRunSummary {
  readonly state: EngineRunState;
  readonly timeline: readonly StageEvent[];
  readonly snapshots: readonly string[];
  readonly stageCount: number;
}

const runCounter = new Map<string, number>();

const nextRunId = (tenant: string, workspace: HorizonWorkspaceId): Brand<string, 'HorizonRunId'> => {
  const next = (runCounter.get(tenant) ?? 0) + 1;
  runCounter.set(tenant, next);
  return `${tenant}-${workspace}-${next}` as Brand<string, 'HorizonRunId'>;
};

export class HorizonExecutionEngine<TInput> {
  readonly #identity: HorizonIdentity;
  readonly #template: HorizonTemplate;
  readonly #payload: TInput;
  readonly #tenant: string;
  readonly #runId: Brand<string, 'HorizonRunId'>;
  readonly #route: readonly HorizonStage[];
  readonly #lattice: ReturnType<typeof buildDefaultLattice<TInput>>;
  readonly #projectionStore: ProjectionStoreRepository;
  readonly #timeseries: InMemoryHorizonTimeseries;

  constructor(
    options: EngineOptions<TInput>,
    projectionStore: ProjectionStoreRepository = new HorizonIncidentProjectionStore(),
  ) {
    this.#identity = options.identity;
    this.#template = options.template;
    this.#payload = options.payload;
    this.#tenant = options.tenant;
    this.#runId = nextRunId(options.tenant, this.#identity.ids.workspace);
    this.#route = options.template.stageOrder;
    this.#lattice = buildDefaultLattice<TInput>(options.template, options.identity);
    this.#projectionStore = projectionStore;
    this.#timeseries = new InMemoryHorizonTimeseries();
  }

  get runState(): EngineRunState {
    return {
      tenant: this.#tenant,
      workspaceId: this.#identity.ids.workspace,
      runId: this.#runId,
      route: this.#route.join('/') as StageChain,
      startedAt: new Date().toISOString(),
      stage: this.#route[0] ?? 'sense',
    };
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#lattice[Symbol.asyncDispose]();
  }

  async run(): Promise<Result<EngineRunSummary>> {
    const events: StageEvent[] = [];
    const snapshots: string[] = [];

    for (const stage of this.#route) {
      const stageEvent = await this.#runStage(stage);
      if (!stageEvent.ok) {
        return err(stageEvent.error);
      }

      const { outputs, durationMs } = stageEvent.value;
      events.push({
        timestamp: new Date().toISOString(),
        stage,
        pluginId: `stage:${stage}`,
        durationMs,
        output: outputs.join('|'),
      });
      snapshots.push(`stage=${stage}|outputs=${outputs.join(',')}|duration=${durationMs}`);
    }

    return ok({
      state: this.runState,
      timeline: events,
      snapshots,
      stageCount: this.#route.length,
    });
  }

  async #runStage(stage: HorizonStage): Promise<Result<{ outputs: readonly string[]; durationMs: number }>> {
    const runStart = Date.now();
    const output = await this.#lattice.executeByStage<Record<string, unknown>>(this.#payload, stage, new AbortController().signal);
    if (!output.ok) {
      return err(output.error);
    }

    const outputs = output.value.map((record) => this.#formatRecord(record));
    const durationMs = Date.now() - runStart;

    const stageSnapshot = this.#composeSnapshot(stage, durationMs, outputs);
    await this.#projectionStore.appendSnapshot(stageSnapshot);
    await this.#projectionStore.queryTimeline({
      workspaceId: this.#identity.ids.workspace,
      from: stageSnapshot.snapshot.timestamp,
      to: stageSnapshot.snapshot.timestamp,
      template: this.#template.templateId,
    });

    await this.#timeseries.ingest(stageSnapshot.snapshot, this.#template, this.#identity);
    await this.#timeseries.query({ workspaceId: this.#identity.ids.workspace });

    return ok({
      outputs,
      durationMs,
    });
  }

  #composeSnapshot(
    stage: HorizonStage,
    durationMs: number,
    outputs: readonly string[],
  ): HorizonProjectionEnvelope {
    const score = outputs.reduce((acc, output) => acc + output.length, 0) + durationMs;
    const metricValue = Number((score / Math.max(1, outputs.length + 1)).toFixed(2));
    const severity = (Math.max(1, Math.min(5, Math.floor(metricValue / 40) + 1)) as 1 | 2 | 3 | 4 | 5);
    const label = buildHorizonLabel(this.#template.domain, stage);
    const metric: HorizonMetric = {
      name: `engine.${stage}`,
      severity,
      score: metricValue,
      unit: 'ms' as Brand<string, 'HorizonMetricUnit'>,
    };

    return {
      identity: this.#identity,
      workspaceId: this.#identity.ids.workspace,
      template: this.#template,
      snapshot: {
        artifactId: `${label}:${this.#runId}` as HorizonSnapshot['artifactId'],
        scenarioId: this.#identity.ids.scenario,
        timestamp: new Date().toISOString(),
        metrics: [metric],
        stage,
      },
      stageRoute: this.runState.route,
      metrics: [metric],
    };
  }

  #formatRecord(record: PluginRunRecord<Record<string, unknown>>): string {
    const outputPayload = record.output as Record<string, unknown>;
    const outputSeed = outputPayload?.['seed'];
    return `${record.pluginId}|${record.route}|${record.durationMs}|${String(outputSeed ?? JSON.stringify(outputPayload))}`;
  }
}

export const createHorizonExecutionEngine = <TInput>(options: EngineOptions<TInput>): HorizonExecutionEngine<TInput> =>
  new HorizonExecutionEngine(options);

export const summarizeRun = (summary: EngineRunSummary): string =>
  `${summary.state.runId}|${summary.state.workspaceId}|${summary.state.tenant}|${summary.stageCount}|${summary.timeline.at(-1)?.timestamp ?? ''}`;
