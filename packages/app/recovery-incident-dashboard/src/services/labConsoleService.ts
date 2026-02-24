import { fail, ok, type Result } from '@shared/result';
import {
  LabConsoleEngine,
  createRunId,
  createPluginId,
  createTenantId,
  createWorkspaceId,
  defaultLabStages,
  type LabPlugin,
  type LabRuntimeEvent,
  type LabRunId,
  type LabStage,
  type StageDiagnostics,
  type WorkspaceDraftInput,
  buildLabPluginDefinition,
  buildTraceIndex,
} from '@domain/recovery-lab-console-core';

interface LiveEventPayload {
  readonly kind: 'info' | 'warn';
  readonly text: string;
  readonly at: string;
}

interface LabRunState {
  readonly runId: LabRunId;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly stage: LabStage;
  readonly output: unknown;
  readonly diagnostics: StageDiagnostics;
}

interface EventEnvelope {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly sequence: number;
  readonly entries: readonly LabRuntimeEvent[];
}

const buildSyntheticPlugin = (name: string, stage: LabStage): LabPlugin => {
  return buildLabPluginDefinition({
    name,
    tenant: 'tenant.synthetic',
    scope: 'topology',
    stage,
    category: 'simulation',
    dependencies: [],
    async run(value: WorkspaceDraftInput) {
      return {
        ...value,
        stage,
        workspace: {
          ...value.workspace,
          labels: [...value.workspace.labels, `plugin:${name}`],
        },
      };
    },
  }) as LabPlugin;
};

const makeDraftInput = (tenantId: string, workspaceId: string): WorkspaceDraftInput => ({
  workspace: {
    workspaceId: createWorkspaceId(tenantId, workspaceId),
    tenantId: createTenantId(tenantId),
    name: `Workspace ${tenantId}`,
    stages: [...defaultLabStages],
    labels: ['synthetic', `tenant:${tenantId}`, `workspace:${workspaceId}`],
    createdAt: new Date().toISOString(),
  },
  signals: ['signal.synthetic.latency', 'signal.synthetic.capacity'],
  stage: defaultLabStages[0],
  metadata: {
    source: 'dashboard-console',
    seed: String(Date.now()),
  },
});

const stageMessages = (stage: LabStage, value: number) => [
  `begin:${stage}:${value}`,
  `resolve:${stage}:ok`,
  `final:${stage}:done`,
] as const;

export class LabConsoleService {
  readonly #events: LabRuntimeEvent[] = [];
  readonly #eventLog: LiveEventPayload[] = [];
  #sequence = 0;
  #active = false;
  #lastRunId: LabRunId | null = null;

  #plugins: readonly LabPlugin[] = defaultLabStages.map((stage, index) =>
    buildSyntheticPlugin(`sim-plugin-${index}`, stage),
  );

  public get eventLog(): readonly LiveEventPayload[] {
    return [...this.#eventLog];
  }

  public get hasActivity(): boolean {
    return this.#events.length > 0;
  }

  public get lastRunId(): LabRunId | null {
    return this.#lastRunId;
  }

  public get plugins(): readonly string[] {
    return this.#plugins.map((plugin) => plugin.name);
  }

  public async replay(limit: number): Promise<EventEnvelope> {
    const entries = [...this.#events].toSorted((left, right) => {
      const leftAt = this.timestampOf(left);
      const rightAt = this.timestampOf(right);
      return leftAt.localeCompare(rightAt);
    });

    return {
      workspaceId: `replay-${Date.now()}`,
      tenantId: 'tenant.synthetic',
      sequence: this.#sequence + limit,
      entries: entries.slice(-limit),
    };
  }

  public async runScenario(signal: string): Promise<Result<LabRunState, Error>> {
    if (this.#active) {
      return fail(new Error('run already active'));
    }

    this.#active = true;
    const runId = createRunId('tenant.synthetic', defaultLabStages[0]);
    this.#lastRunId = runId;
    const startedAt = new Date().toISOString();
    const workspaceId = createWorkspaceId('tenant.synthetic', signal);
    const draft = makeDraftInput('tenant.synthetic', signal);
    const trace: string[] = [];

    this.#events.length = 0;
    const engine = new LabConsoleEngine(this.#plugins);
    try {
      const output = await engine.run(draft, {
        tenantId: createTenantId('tenant.synthetic'),
        workspaceId,
        allowPartialRun: true,
      });

      if (!output.ok) {
        return fail(output.error);
      }

      this.#sequence += 1;
      for (const message of buildTraceIndex(defaultLabStages, 'tenant.synthetic')) {
        trace.push(message);
      }

      this.pushTraceEvents(runId, workspaceId, defaultLabStages, startedAt, new Date().toISOString());
      this.#active = false;
      this.logNotice(`engine started ${runId}`);

      const diagnostics: StageDiagnostics = {
        timeline: [...defaultLabStages],
        stageCount: defaultLabStages.length,
        trace,
      };

      return ok({
        runId,
        startedAt,
        endedAt: new Date().toISOString(),
        stage: defaultLabStages[defaultLabStages.length - 1],
        output: output.value.output,
        diagnostics,
      });
    } catch (error) {
      this.#active = false;
      this.logWarning(`${error}`);
      return fail(error as Error);
    }
  }

  public subscribe(): ReadonlyArray<LabRuntimeEvent> {
    return [...this.#events];
  }

  private logNotice(message: string): void {
    this.#eventLog.push({ kind: 'info', text: message, at: new Date().toISOString() });
  }

  private logWarning(message: string): void {
    this.#eventLog.push({ kind: 'warn', text: message, at: new Date().toISOString() });
  }

  private timestampOf(event: LabRuntimeEvent): string {
    switch (event.kind) {
      case 'plugin.started':
        return event.startedAt;
      case 'plugin.completed':
        return event.completedAt;
      case 'plugin.failed':
        return event.failedAt;
      case 'run.complete':
        return event.completedAt;
      default:
        return new Date().toISOString();
    }
  }

  private pushTraceEvents(
    runId: LabRunId,
    workspaceId: string,
    stages: readonly LabStage[],
    startedAt: string,
    endedAt: string,
  ): void {
    const timeline: LabRuntimeEvent[] = [
      {
        kind: 'run.complete' as const,
        runId,
        stage: 'audit',
        completedAt: endedAt,
        diagnostics: {
          timeline: [...stages],
          stageCount: stages.length,
          trace: [
            `workspace:${workspaceId}`,
            ...stages.map((stage) => `stage:${stage}`),
            `duration:${Date.parse(endedAt) - Date.parse(startedAt)}`,
          ],
        },
      },
      ...stages.map((stage, index) => ({
        kind: 'plugin.started' as const,
        pluginId: createPluginId(`synthetic:${stage}:${index}`, 'simulation', stage),
        stage,
        startedAt,
        details: {
          tenant: 'tenant.synthetic',
          source: 'dashboard',
          runId,
          index: `${index}`,
          messages: stageMessages(stage, index).join('|'),
        },
      })),
    ];

    this.#events.push(...timeline);
  }
}
