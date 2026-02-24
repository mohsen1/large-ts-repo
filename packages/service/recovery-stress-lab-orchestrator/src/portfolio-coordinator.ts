import { type PathValue } from '@shared/type-level';
import {
  createRunbookId,
  createSignalId,
  createStepId,
  createTenantId,
  type CommandRunbook,
  type OrchestrationPlan,
  type RecoverySignal,
  type TenantId,
  type WorkloadTarget,
  type WorkloadTopology,
} from '@domain/recovery-stress-lab';
import {
  type StressLabOrchestratorInput,
  type StressLabOrchestratorReport,
  runOrchestrator,
} from './orchestration-console';

export type PortfolioMode = 'batch' | 'stream' | 'replay';

export interface PortfolioIntent {
  readonly tenantId: TenantId;
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly targets: readonly WorkloadTarget[];
}

export interface PortfolioStatus {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly mode: PortfolioMode;
  readonly inFlight: number;
  readonly completed: number;
  readonly failed: number;
}

export interface PortfolioTimeline {
  readonly sessionId: string;
  readonly stage: 'queued' | 'running' | 'finished' | 'failed';
  readonly stageHistory: readonly string[];
}

const pathTemplates = {
  batch: ['queue', 'run', 'snapshot', 'finish'] as const,
  stream: ['queue', 'fanout', 'collect', 'snapshot', 'finish'] as const,
  replay: ['queue', 'reconstruct', 'sweep', 'finish'] as const,
} satisfies Record<PortfolioMode, readonly string[]>;

const iteratorFrom =
  (globalThis as { readonly Iterator?: { from?: <T>(value: Iterable<T>) => { map<U>(transform: (value: T) => U): { toArray(): U[] }; toArray(): T[] } } }).Iterator?.from;

const modeHint = (intentCount: number): readonly PortfolioMode[] => (intentCount > 12 ? ['stream', 'batch'] : ['batch', 'replay']);

const fallbackRunbook = (tenantId: TenantId, index: number): CommandRunbook => ({
  id: createRunbookId(`fallback-${tenantId}-${index}`),
  tenantId,
  name: 'Fallback orchestration runbook',
  description: 'Auto-generated runbook for missing plan definitions',
  steps: [
    {
      commandId: createStepId(`fallback-step-${tenantId}-${index}-observe`),
      title: 'Observe signal topology',
      phase: 'observe',
      estimatedMinutes: 12,
      prerequisites: [],
      requiredSignals: [createSignalId(`fallback-signal-${tenantId}-${index}`)],
    },
    {
      commandId: createStepId(`fallback-step-${tenantId}-${index}-restore`),
      title: 'Restore baseline',
      phase: 'restore',
      estimatedMinutes: 16,
      prerequisites: [createStepId(`fallback-step-${tenantId}-${index}-observe`)],
      requiredSignals: [createSignalId(`fallback-signal-${tenantId}-${index}`)],
    },
  ],
  ownerTeam: 'orchestration',
  cadence: {
    weekday: 1,
    windowStartMinute: 0,
    windowEndMinute: 45,
  },
});

export class PortfolioCoordinator<TIntent extends readonly PortfolioIntent[]> {
  readonly #tenantId: TenantId;
  readonly #intents: TIntent;
  readonly #timelines = new Map<string, PortfolioTimeline>();
  readonly #completed = new Set<string>();

  public constructor(tenantId: string, intents: TIntent) {
    this.#tenantId = createTenantId(tenantId);
    this.#intents = intents;
  }

  public get status(): PortfolioStatus {
    const timeline = [...this.#timelines.values()];
    const active = timeline.filter((entry) => entry.stage === 'running').length;
    return {
      id: `${this.#tenantId}::${this.#intents.length}`,
      tenantId: this.#tenantId,
      mode: modeHint(this.#intents.length).includes('stream') ? 'stream' : 'batch',
      inFlight: active,
      completed: this.#completed.size,
      failed: timeline.filter((entry) => entry.stage === 'failed').length,
    };
  }

  public async runPortfolio(mode: PortfolioMode = 'batch'): Promise<{ readonly reports: readonly StressLabOrchestratorReport[]; readonly status: PortfolioStatus }> {
    const intents = this.#intents.toSorted((left, right) => right.signals.length - left.signals.length);
    const plans = this.plansByRunbook();
    const reports: StressLabOrchestratorReport[] = [];
    const hints = modeHint(intents.length);
    const effectiveMode = hints.includes(mode) ? mode : hints[0] ?? 'batch';

    const runIntents = plans.map(async (input, index) => {
      const sessionId = `${this.#tenantId}::portfolio-${index}`;
      const template = pathTemplates[effectiveMode];
      const history = [...template];

      this.#timelines.set(sessionId, {
        sessionId,
        stage: 'running',
        stageHistory: history,
      });

      const activePlan = input.runbook;

      try {
        const report = await runOrchestrator({
          tenantId: this.#tenantId,
          runbook: activePlan,
          topology: input.topology,
          signals: input.signals,
          targets: input.targets,
        });

        this.#timelines.set(sessionId, {
          sessionId,
          stage: 'finished',
          stageHistory: [...history, `session:${report.sessionId}`],
        });
        this.#completed.add(sessionId);
        reports.push(report);
      } catch {
        this.#timelines.set(sessionId, {
          sessionId,
          stage: 'failed',
          stageHistory: [...history, 'failed'],
        });
      }
    });

    if (effectiveMode === 'stream') {
      await Promise.all(runIntents);
    } else if (effectiveMode === 'replay') {
      await Promise.resolve();
      for (const promise of runIntents) {
        await promise;
      }
    } else {
      for (const promise of runIntents) {
        await promise;
      }
    }

    return { reports, status: this.status };
  }

  public plansByRunbook(): readonly (StressLabOrchestratorInput & { readonly runbook: CommandRunbook })[] {
    const withIndex = this.#intents.map((intent, index) => ({ intent, index }) as const);
    const raw =
      iteratorFrom?.(withIndex)
        ?.map((entry) => ({
          tenantId: this.#tenantId,
          runbook: entry.intent.runbooks.at(0) ?? fallbackRunbook(this.#tenantId, entry.index),
          topology: entry.intent.topology,
          signals: entry.intent.signals,
          targets: entry.intent.targets,
          snapshotEnabled: true,
        }))
        ?.toArray() ?? this.#intents.map((intent, index) => ({
          tenantId: this.#tenantId,
          runbook: intent.runbooks.at(0) ?? fallbackRunbook(this.#tenantId, index),
          topology: intent.topology,
          signals: intent.signals,
          targets: intent.targets,
          snapshotEnabled: true,
        }));

    return raw;
  }

  public summaryPaths(): readonly string[] {
    return Object.values(pathTemplates).flatMap((template) => [...template]).toSorted();
  }

  public get timeline(): readonly PortfolioTimeline[] {
    return [...this.#timelines.values()];
  }

  public mapSignals(paths: readonly [number, string][]): ReadonlyArray<PathValue<{ readonly run: { readonly phases: Record<string, string> } }, 'run.phases'>> {
    return paths
      .toSorted((left, right) => String(left[0]).localeCompare(String(right[0])))
      .map((entry) => `run.phases.${entry[0]}` as unknown as PathValue<{ readonly run: { readonly phases: Record<string, string> } }, 'run.phases'>);
  }

  public tupleSignalPaths(): readonly string[] {
    return pathTemplates.batch;
  }
}

export type OrchestratorInputPlan = StressLabOrchestratorInput;
