import { fail, ok, type Result } from '@shared/result';
import { defaultCatalogManifest } from '@domain/recovery-ops-playbook-studio';
import type { PluginState, PlaybookPluginDefinition, RunId } from '@domain/recovery-ops-playbook-studio';
import { InMemoryPlaybookStudioStore } from '@data/recovery-ops-playbook-studio-store';
import { createOrchestrator } from './runtime';
import type {
  OrchestratorConfig,
  OrchestratorOptions,
  OrchestratorRequest,
  OrchestratorResult,
  OrchestratorSnapshot,
} from './types';

export interface StudioFacadeDeps {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly selectedStages: readonly PluginState[];
  readonly pluginCatalog?: readonly PlaybookPluginDefinition[];
  readonly options?: Partial<OrchestratorOptions>;
}

export interface PlaybookStudioFacadeRuntime {
  prepareAndRun(context: {
    tenantId: string;
    workspaceId: string;
    operator: string;
    input: Record<string, unknown>;
    tags?: readonly string[];
  }): Promise<Result<OrchestratorResult, string>>;
  inspect(runId: RunId): Promise<Result<OrchestratorSnapshot, string>>;
  listRunIds(tenantId?: string): Promise<Result<readonly string[], string>>;
  abort(runId: RunId): Promise<Result<boolean, string>>;
  diagnostics(runId: RunId): Promise<Result<readonly string[], string>>;
}

const buildCatalog = (customCatalog?: OrchestratorConfig['catalog']): OrchestratorConfig['catalog'] =>
  customCatalog && customCatalog.entries.length > 0 ? customCatalog : defaultCatalogManifest;

export class RecoveryOpsPlaybookStudioFacade implements PlaybookStudioFacadeRuntime {
  readonly #orchestrator;
  readonly #defaults: {
    tenantId: string;
    workspaceId: string;
    selectedStages: readonly PluginState[];
  };

  constructor(deps: StudioFacadeDeps) {
    const pluginCatalog = buildCatalog(undefined);
    const config: OrchestratorConfig = {
      tenantId: deps.tenantId as OrchestratorConfig['tenantId'],
      workspaceId: deps.workspaceId as OrchestratorConfig['workspaceId'],
      catalog: pluginCatalog,
      options: deps.options,
      progress: (status, payload) => {
        console.debug('[playbook-studio-facade]', status, JSON.stringify(payload));
      },
    };
    this.#orchestrator = createOrchestrator(config, new InMemoryPlaybookStudioStore());
    this.#defaults = {
      tenantId: deps.tenantId,
      workspaceId: deps.workspaceId,
      selectedStages: deps.selectedStages,
    };
  }

  async prepareAndRun(context: {
    tenantId: string;
    workspaceId: string;
    operator: string;
    input: Record<string, unknown>;
    tags?: readonly string[];
  }): Promise<Result<OrchestratorResult, string>> {
    const bootstrap = await this.#orchestrator.bootstrap();
    if (!bootstrap.ok) return fail(bootstrap.error);

    const request: OrchestratorRequest = {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      selectedStages: this.#defaults.selectedStages,
      context: {
        region: 'global',
        correlationId: `${context.tenantId}:${context.workspaceId}:${Date.now()}`,
        operator: context.operator,
      },
      input: {
        ...context.input,
        tags: [...(context.tags ?? [])],
      },
      plugins: undefined,
    };

    return this.#orchestrator.queueRun(request);
  }

  async inspect(runId: RunId): Promise<Result<OrchestratorSnapshot, string>> {
    return this.#orchestrator.inspect(runId);
  }

  async listRunIds(tenantId?: string): Promise<Result<readonly string[], string>> {
    return this.#orchestrator.listRuns({
      tenantId: tenantId ?? this.#defaults.tenantId,
      workspaceId: this.#defaults.workspaceId,
    });
  }

  async abort(runId: RunId): Promise<Result<boolean, string>> {
    return this.#orchestrator.abort(runId);
  }

  async diagnostics(runId: RunId): Promise<Result<readonly string[], string>> {
    return this.#orchestrator.runDiagnostics(runId);
  }
}

export const createFacade = (deps: StudioFacadeDeps): PlaybookStudioFacadeRuntime =>
  new RecoveryOpsPlaybookStudioFacade(deps);

