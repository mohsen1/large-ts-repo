import { fail, ok, type Result } from '@shared/result';
import {
  type ArtifactId,
  type PluginDefinitionBag,
  type RunId,
  type TenantId,
  type WorkspaceId,
} from '@shared/playbook-studio-runtime';
import { withBrand } from '@shared/core';
import {
  StudioOrchestrator,
  type StudioRunRequest,
  type StudioRunResult,
} from '@domain/recovery-playbook-studio-core';
import { parseStudioCommand } from './commands';
import { defaultTemplate, defaultTemplateIntent } from '@domain/recovery-playbook-studio-core';
import type { StudioCommand } from './contracts';
import {
  normalizeRunId,
  STUDIO_SCOPE,
  type SnapshotRecord,
  type StudioCommandNames,
  type StudioTimelineEntry,
} from './contracts';

type StudioPluginDefinitions = PluginDefinitionBag;

export interface StudioSessionState {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly artifactId: ArtifactId;
  readonly timeline: readonly StudioTimelineEntry[];
  readonly snapshots: readonly SnapshotRecord<string>[];
  readonly lastRunId?: string;
  readonly active: boolean;
}

export interface StudioSessionDeps {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly artifactId: string;
}

export class StudioSession<TPlugins extends StudioPluginDefinitions> {
  readonly #orchestrator: StudioOrchestrator<TPlugins>;
  readonly #state: {
    runId?: string;
    timeline: StudioTimelineEntry[];
    snapshots: SnapshotRecord<(typeof STUDIO_SCOPE)[keyof typeof STUDIO_SCOPE]>[];
    active: boolean;
  };

  constructor(private readonly deps: StudioSessionDeps, plugins: TPlugins) {
    this.#orchestrator = new StudioOrchestrator(
      {
        tenantId: deps.tenantId,
        workspaceId: deps.workspaceId,
        requestId: `${deps.tenantId}/${deps.workspaceId}`,
      },
      plugins,
    );
    this.#state = {
      timeline: [],
      snapshots: [],
      active: false,
    };
  }

  async bootstrap() {
    const summary = await this.#orchestrator.describe();
    this.#state.timeline.push(this.makeEntry('prepare', summary.runId, 'bootstrap'));
    this.#state.snapshots.push({
      scope: STUDIO_SCOPE.local,
      at: new Date().toISOString(),
      values: [withBrand(summary.runId, `Record${STUDIO_SCOPE.local}`)],
    });
    return summary;
  }

  async handle(raw: unknown): Promise<Result<StudioRunResult, string>> {
    const commandResult = parseStudioCommand(raw);
    if (!commandResult.ok) return fail(commandResult.error);

    const request = this.buildRequest(commandResult.value.command);
    if (!request.ok) return fail(request.error);

    const result = await this.#orchestrator.run(commandResult.value, request.value);
    if (!result.ok) {
      this.#state.timeline.push(
        this.makeEntry(commandResult.value.command.command, request.value.templateId, commandResult.value.command.command),
      );
      return fail(result.error);
    }

    this.#state.runId = String(result.value.run.runId);
    this.#state.active = true;
    this.#state.timeline.push(
      this.makeEntry(
        commandResult.value.command.command,
        this.#state.runId,
        `run:${result.value.run.status}`,
      ),
    );
    this.#state.snapshots.push({
      scope: STUDIO_SCOPE.shared,
      at: new Date().toISOString(),
      values: [
        withBrand(this.#state.runId, `Record${STUDIO_SCOPE.shared}`),
        withBrand(commandResult.value.command.command, `Record${STUDIO_SCOPE.shared}`),
      ],
    });

    return ok(result.value);
  }

  private buildRequest(command: StudioCommand): Result<StudioRunRequest, string> {
    const artifact = defaultTemplate.artifactId;
    if (command.command === 'prepare') {
      const fallback = defaultTemplateIntent;
      if (!fallback.ok) {
        return fail('missing-template');
      }
      return ok({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        artifactId: String(artifact),
        requestedBy: command.requestedBy,
        templateId: fallback.value.runId,
        strategy: command.strategy,
      });
    }

    if (command.command === 'execute') {
      return ok({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        artifactId: String(artifact),
        requestedBy: 'operator',
        templateId: command.runId,
        strategy: command.force ? 'predictive' : fallbackStrategy(command.runId),
      });
    }

    if (command.command === 'audit') {
      return ok({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        artifactId: String(artifact),
        requestedBy: 'auditor',
        templateId: command.runId,
        strategy: 'predictive',
      });
    }

    return ok({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      artifactId: String(artifact),
      requestedBy: 'operator',
      templateId: `${command.stage}-${Date.now()}`,
      strategy: 'reactive',
    });
  }

  private makeEntry(
    stage: StudioCommandNames,
    runId: string,
    messageSuffix: string,
  ): StudioTimelineEntry {
    const brandedRunId = normalizeRunId(runId);
    return {
      sequence: this.#state.timeline.length + 1,
      stage,
      runId: brandedRunId,
      tenant: withBrand(this.deps.tenantId, 'TenantId') as TenantId,
      workspace: withBrand(this.deps.workspaceId, 'WorkspaceId') as WorkspaceId,
      severity: 'info',
      message: `${stage} ${messageSuffix}`,
    };
  }

  get state(): StudioSessionState {
    return {
      tenantId: this.deps.tenantId,
      workspaceId: this.deps.workspaceId,
      artifactId: withBrand(defaultTemplate.artifactId, 'ArtifactId') as ArtifactId,
      timeline: this.#state.timeline,
      snapshots: this.#state.snapshots,
      lastRunId: this.#state.runId,
      active: this.#state.active,
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#state.timeline.length = 0;
    this.#state.snapshots.length = 0;
    await this.#orchestrator[Symbol.asyncDispose]();
  }
}

const fallbackStrategy = (runId: string): 'reactive' | 'predictive' | 'safety' => {
  if (runId.includes('safety')) return 'safety';
  if (runId.includes('reactive')) return 'reactive';
  return 'predictive';
};
