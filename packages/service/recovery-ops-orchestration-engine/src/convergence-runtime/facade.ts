import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ConvergencePluginDescriptor,
  ConvergencePlanId,
  ConvergenceRunId,
  ConvergenceStudioId,
  ConvergenceSummary,
  normalizeConvergenceTag,
  normalizePlanId,
  normalizeRunId,
  normalizeStudioId,
} from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/types';
import { executePlan, type ExecutorReport } from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/executor';
import {
  type ConvergenceRunEnvelope,
  type ConvergenceRunOutput,
  type ConvergenceRunPayload,
  type ConvergenceRunMode,
  type RuntimeCheckpoint,
} from './types';

const runRequestSchema = z.object({
  studioId: z.string().min(3),
  requestedBy: z.string().min(1),
  mode: z.union([z.literal('live'), z.literal('dry-run'), z.literal('replay')]),
  pluginIds: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
  modeOptions: z
    .object({
      parallel: z.boolean().default(false),
      timeoutMs: z.number().int().min(300).max(120_000).default(5_000),
    })
    .default({}),
});

export type RunRequestInput = z.input<typeof runRequestSchema>;

export interface RunFacadeDependencies {
  readonly resolver: (studioId: ConvergenceStudioId) => Promise<readonly ConvergencePluginDescriptor[]>;
  readonly logger: (checkpoint: RuntimeCheckpoint) => void;
}

interface RunExecution extends ExecutorReport {
  readonly labels: readonly string[];
  readonly pluginCount: number;
  readonly selectedPlugins: readonly ConvergencePluginDescriptor[];
}

export class ConvergenceRunFacade {
  #disposed = false;
  readonly #dependencies: RunFacadeDependencies;

  constructor(dependencies: RunFacadeDependencies) {
    this.#dependencies = dependencies;
  }

  async start(request: RunRequestInput): Promise<ConvergenceRunOutput> {
    const payload = runRequestSchema.parse(request);
    const studioId = normalizeStudioId(payload.studioId);
    const runId = normalizeRunId(`run:${studioId}:${randomUUID()}`);
    const labels = payload.labels.map((label) => normalizeConvergenceTag(label));
    const execution = await this.#startExecution(studioId, runId, payload);
    const report = this.#buildReport(studioId, runId, execution, payload.mode);
    const selectedPlugins = execution.selectedPlugins ?? [];

    return {
      envelope: {
        studioId,
        runId,
        mode: payload.mode,
        requestedBy: payload.requestedBy,
        createdAt: new Date().toISOString(),
      },
      payload: {
        runId,
        summary: execution.summary,
        lifecycle: execution.lifecycle,
        selected: selectedPlugins,
        activeStages: execution.summary.stageTrail,
      },
      report,
    };
  }

  async #startExecution(
    studioId: ConvergenceStudioId,
    runId: ConvergenceRunId,
    payload: z.infer<typeof runRequestSchema>,
  ): Promise<RunExecution> {
    const plugins = await this.#dependencies.resolver(studioId);
    this.#dependencies.logger({
      runId,
      label: 'resolver',
      value: { requested: payload.pluginIds.length, resolved: plugins.length, labels: payload.labels },
    });

    const selectedPlugins = plugins;
    const executorReport = await this.#buildExecutorReport(studioId, runId, plugins, selectedPlugins, payload.modeOptions);
    const tags = [
      ...payload.labels,
      payload.mode,
      'facade',
      `count:${selectedPlugins.length}`,
    ].map((label) => normalizeConvergenceTag(label));

    return {
      ...executorReport,
      labels: tags,
      pluginCount: selectedPlugins.length,
      selectedPlugins,
      summary: {
        ...executorReport.summary,
        tags,
        selectedPlugins: selectedPlugins.map((plugin) => plugin.id),
      },
    } satisfies RunExecution;
  }

  async #buildExecutorReport(
    studioId: ConvergenceStudioId,
    runId: ConvergenceRunId,
    plugins: readonly ConvergencePluginDescriptor[],
    selectedPlugins: readonly ConvergencePluginDescriptor[],
    execution: { parallel: boolean; timeoutMs: number },
  ): Promise<RunExecution> {
    if (plugins.length === 0) {
      this.#dependencies.logger({
        runId,
        label: 'empty-suite',
        value: { studioId, plugins: 0 },
      });
      return {
        runId,
        planId: normalizePlanId(`plan:${studioId}:empty`),
        lifecycle: 'degraded',
        elapsedMs: 0,
        summary: {
          runId,
          workspaceId: studioId,
          stageTrail: ['discover'],
          selectedPlugins: [],
          score: 0,
          tags: [normalizeConvergenceTag('empty')],
          diagnostics: ['no plugins'],
        },
        labels: [],
        pluginCount: selectedPlugins.length,
        selectedPlugins,
      };
    }

    const report = await executePlan({
      studioId,
      plugins,
      options: execution,
    });

    const summary = {
      ...report.summary,
      tags: [...report.summary.tags, normalizeConvergenceTag(`run:${runId}`)],
      diagnostics: [...report.summary.diagnostics, `parallel=${execution.parallel}`, `timeout=${execution.timeoutMs}`],
    } as ConvergenceSummary;
    this.#dependencies.logger({
      runId,
      label: 'execution',
      value: { elapsedMs: report.elapsedMs, pluginCount: plugins.length },
    });
    return {
      ...report,
      summary,
      labels: [],
      pluginCount: selectedPlugins.length,
      selectedPlugins,
    };
  }

  #buildReport(
    studioId: ConvergenceStudioId,
    runId: ConvergenceRunId,
    execution: RunExecution,
    mode: ConvergenceRunMode,
  ): ConvergenceRunOutput['report'] {
    if (this.#disposed) {
      return {
        elapsedMs: 0,
        stageCount: 0,
        pluginCount: execution.pluginCount,
        planId: execution.planId,
        status: 'failed',
      };
    }

    return {
      elapsedMs: execution.elapsedMs,
      stageCount: execution.summary.stageTrail.length,
      pluginCount: execution.pluginCount,
      planId: normalizePlanId(execution.planId),
      status: mode === 'dry-run' ? 'partial' : execution.lifecycle === 'complete' ? 'ok' : 'failed',
    };
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    void this[Symbol.asyncDispose]();
  }
}

export const createRunFacade = (dependencies: RunFacadeDependencies): ConvergenceRunFacade => new ConvergenceRunFacade(dependencies);
