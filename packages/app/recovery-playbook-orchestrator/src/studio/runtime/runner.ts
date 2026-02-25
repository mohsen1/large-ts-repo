import { fail, ok, type Result } from '@shared/result';
import { StudioSession } from '../session';
import { StudioHttpAdapter, createHttpEnvelope, resolveCommandUrl } from '../adapters/http';
import type { PluginDefinitionBag } from '@shared/playbook-studio-runtime';
import { defaultTemplate } from '@domain/recovery-playbook-studio-core';
import type { StudioRunResult } from '@domain/recovery-playbook-studio-core';
import { withBrand } from '@shared/core';

type RunnerDeps = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly artifactId: string;
};

export interface StudioRunnerHandle {
  readonly execute: (command: unknown) => Promise<Result<StudioRunResult, string>>;
  readonly bootstrap: () => Promise<unknown>;
  readonly diagnostics: () => Promise<Record<string, number>>;
  readonly pluginList: () => string[];
  readonly dispose: () => Promise<void>;
}

const createPlugins = async (): Promise<PluginDefinitionBag> => {
  const response = await fetch('/api/studio/plugins');
  if (!response.ok) {
    return {} as PluginDefinitionBag;
  }

  const payload = await response.json() as { readonly pluginIds?: readonly string[] };
  const ids = payload?.pluginIds ?? [];
  return ids.reduce((acc, id) => {
    (acc as Record<string, unknown>)[id] = {
      id,
      kind: 'planner',
      metadata: {
        kind: id,
        version: 'v1.0',
        dependencies: [],
        capabilities: ['planning'],
      },
      setup: async () => ({ plugin: id, ready: true }),
    };
    return acc;
  }, {} as PluginDefinitionBag);
};

export const createStudioRunner = async (deps: RunnerDeps): Promise<StudioRunnerHandle> => {
  const plugins = await createPlugins();
  const session = new StudioSession(deps, plugins);
  await session.bootstrap();

  const bootstrap = async () => session.bootstrap();
  const execute = async (command: unknown): Promise<Result<StudioRunResult, string>> => {
    const result = await session.handle(command);
    if (!result.ok) return fail(result.error);
    return ok({
      ...result.value,
      run: {
        ...result.value.run,
        runId: withBrand(result.value.run.runId, 'RunId'),
      },
    });
  };

  const diagnostics = async () => {
    const timeline = session.state.timeline;
    const summary = timeline.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.stage] = (acc[entry.stage] ?? 0) + 1;
      return acc;
    }, {});

    return summary;
  };

  const pluginList = () => {
    const summary = session.state.timeline.map((item) => item.message).slice(0, 16);
    const plugins = [
      'planner',
      'executor',
      'auditor',
      'viewer',
      defaultTemplate.artifactId,
      ...summary,
    ];
    return plugins.filter((value, index, items) => index === items.indexOf(value));
  };

  const dispose = async () => {
    await session[Symbol.asyncDispose]();
  };

  const adapters = new StudioHttpAdapter({
    baseUrl: '/api',
    tenantId: deps.tenantId,
    workspaceId: deps.workspaceId,
    headers: { accept: 'application/json' },
  });

  const commandEnvelope = createHttpEnvelope({
    tenantId: deps.tenantId,
    workspaceId: deps.workspaceId,
    artifactId: deps.artifactId,
    command: 'bootstrap',
    options: { template: defaultTemplate.artifactId },
  });

  const commandUrl = resolveCommandUrl(commandEnvelope.command, deps.tenantId, deps.workspaceId);
  const remote = await adapters.send<{ status: string }>(commandUrl, commandEnvelope).catch(() => ({ status: 'offline' }));

  if (remote.status === 'error') {
    await session[Symbol.asyncDispose]();
    throw new Error('runner-bootstrap-failed');
  }

  return {
    execute,
    bootstrap,
    diagnostics: async () => diagnostics(),
    pluginList,
    dispose,
  };
};
