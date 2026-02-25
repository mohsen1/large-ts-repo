import {
  chunkBy,
  collectAsyncIterable,
  collectIterable,
  createAsyncDisposableStack,
} from '@shared/recovery-synthesis-runtime';
import type { NoInfer } from '@shared/type-level';

import { asPercent, asMillis } from '@domain/recovery-scenario-lens';
import type { OrchestrationInput, OrchestratorEnvelope, OrchestrationRunId } from './types';
import { RecoverySynthesisOrchestrator } from './orchestrator';
import { RecoverySynthesisQuantumFacade } from './quantum-runtime';
import { isWellFormedEnvelope } from './utils';

type PortfolioSeed = {
  readonly runId: OrchestrationRunId;
  readonly input: OrchestrationInput;
};

type PortfolioState = {
  readonly active: ReadonlySet<OrchestrationRunId>;
  readonly completed: readonly OrchestrationRunId[];
};

type PortfolioSummaryTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [{ readonly [K in keyof Head]: Head }, ...PortfolioSummaryTuple<Tail>]
  : readonly [];

export interface PortfolioRunRecord {
  readonly runId: OrchestrationRunId;
  readonly envelope: OrchestratorEnvelope;
  readonly elapsedMs: number;
  readonly warnings: readonly string[];
}

export interface PortfolioChunk {
  readonly index: number;
  readonly total: number;
  readonly runs: readonly OrchestrationRunId[];
}

interface PortfolioProgress {
  readonly batchIndex: number;
  readonly queued: number;
  readonly startedAt: string;
}

const createRunState = (runId: OrchestrationRunId): PortfolioState => ({
  active: new Set([runId]),
  completed: [],
});

const buildSeed = (input: OrchestrationInput): PortfolioSeed => ({
  runId: `${Date.now()}-portfolio` as OrchestrationRunId,
  input,
});

export interface PortfolioOptions {
  readonly chunkSize?: number;
  readonly timeoutMs?: number;
  readonly withSimulation?: boolean;
}

export class QuantumPortfolio {
  readonly #orchestrator = new RecoverySynthesisOrchestrator({
    storage: {
      save: async () => {},
      load: async () => undefined,
    },
    publisher: { publish: async () => {} },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  });
  readonly #facade = new RecoverySynthesisQuantumFacade({
    storage: {
      save: async () => {},
      load: async () => undefined,
    },
    publisher: { publish: async () => {} },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  });

  async runBatch(
    inputs: readonly OrchestrationInput[],
    options: PortfolioOptions = {},
  ): Promise<readonly PortfolioRunRecord[]> {
    const chunkSize = options.chunkSize ?? 3;
    const timeoutMs = options.timeoutMs ?? 250;
    const queue = [...inputs];
    const records: PortfolioRunRecord[] = [];
    const stack = createAsyncDisposableStack();

    try {
      for (const chunk of chunkBy(queue, chunkSize)) {
        const chunkJobs = chunk.map((input) => this.runSeed(buildSeed(input), options.withSimulation ?? false));
        const chunkRecords = await Promise.all(chunkJobs);
        records.push(...chunkRecords);
        await new Promise((resolve) => setTimeout(resolve, timeoutMs));
      }

      return records;
    } finally {
      await stack[Symbol.asyncDispose]();
    }
  }

  private async runSeed(seed: PortfolioSeed, withSimulation: boolean): Promise<PortfolioRunRecord> {
    const state = createState(seed.runId);
    const startedAt = Date.now();

    const envelope = await this.#orchestrator.orchestrate(seed.input);
    if (withSimulation && envelope.model.activePlan) {
      await this.#orchestrator.simulate(envelope.model.activePlan);
    }

    return {
      runId: seed.runId,
      envelope,
      elapsedMs: Date.now() - startedAt,
      warnings: [...envelope.warnings, ...state.active.has(seed.runId) ? ['state-sync'] : []],
    };
  }

  async runWithQuantumFacade(inputs: readonly OrchestrationInput[]): Promise<readonly PortfolioRunRecord[]> {
    const outputs = await Promise.all(
      inputs.map(async (input) => {
        const run = await this.#facade.runOrchestration(input);
        if (!run.workspace.events.length) {
          throw new Error(`empty workspace for ${run.runId}`);
        }

        const hasValidEnvelope = isWellFormedEnvelope(run.workspace.events[0]);
        const envelope = {
          runId: run.runId,
          status: 'ready',
          model: run.workspace.latestOutput?.readModel ?? ({} as any),
          warnings: run.workspace.timeline.length ? [] : ['empty-timeline'],
          metrics: {
            tags: ['quantum', 'portfolio'],
            score: run.workspace.timeline.length,
            completionRate: hasValidEnvelope ? asPercent(1) : asPercent(0),
            meanTimeToRecoveryMs: asMillis(5000),
            errorRate: hasValidEnvelope ? 0 : 1,
            stressIndex: run.workspace.timeline.length,
          },
        } as OrchestratorEnvelope;

        return {
          runId: run.runId,
          envelope,
          elapsedMs: run.workspace.events.length * 11,
          warnings: run.workspace.events.flatMap((event) => (event.kind === 'store' ? [event.traceId] : [])),
        };
      }),
    );

    return outputs;
  }

  createChunks<TItems extends readonly OrchestrationInput[], TSize extends number>(
    items: NoInfer<TItems>,
    chunkSize: TSize,
  ): readonly PortfolioChunk[] {
    const buckets = [...chunkBy(items, chunkSize)];
    return buckets.map((chunk, index) => ({
      index,
      total: buckets.length,
      runs: chunk.map((item) => `${item.blueprint.scenarioId}` as OrchestrationRunId),
    }));
  }

  async *streamProgress(inputs: readonly OrchestrationInput[]): AsyncGenerator<PortfolioProgress> {
    const startedAt = new Date().toISOString();
    for (const [batchIndex, chunk] of collectIterable(chunkBy(inputs, 2)).entries()) {
      yield {
        batchIndex,
        queued: chunk.length,
        startedAt,
      };

      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

export const summarizeChunks = <TInputs extends readonly OrchestrationInput[]>(
  inputs: NoInfer<TInputs>,
  size: number,
): PortfolioSummaryTuple<TInputs> => {
  const chunks = chunkBy(inputs, size);
  const summary = [...chunks].map((chunk) => ({
    index: chunk.length,
    total: inputs.length,
    runs: chunk.map((item) => `${item.blueprint.scenarioId}` as OrchestrationRunId),
  }));
  return summary as unknown as PortfolioSummaryTuple<TInputs>;
};

export const collectPortfolio = async (
  portfolio: QuantumPortfolio,
  inputs: readonly OrchestrationInput[],
): Promise<readonly OrchestratorEnvelope[]> => {
  const records = await portfolio.runBatch(inputs);
  return collectAsyncIterable(
    (async function* () {
      for (const record of records) {
        yield record.envelope;
      }
    })(),
  );
};

const createState = (runId: OrchestrationRunId): PortfolioState =>
  ({
    active: new Set([runId]),
    completed: [],
  }) as PortfolioState;
