import {
  type PluginExecutionOptions,
  type PluginExecutionResult,
  type PluginRunContext,
  type StudioContext,
  type StudioRunInput,
  type StudioRunOutput,
  type StudioPluginDefinition,
  type StudioPluginEvent,
  type PluginId,
} from '@shared/cockpit-studio-core';

export type StudioTemplate = {
  readonly templateId: string;
  readonly title: string;
  readonly stageHints: readonly string[];
};

export type PluginStageHint<T extends StudioTemplate> = T['stageHints'][number];

export type StageSuggestion = PluginStageHint<StudioTemplate>;

export type StudioTemplateReport = {
  readonly templateId: string;
  readonly pluginCount: number;
  readonly hasPlan: boolean;
  readonly hasVerify: boolean;
  readonly suggestionCount: number;
};

export const templateCatalog: readonly StudioTemplate[] = [
  {
    templateId: 'template:baseline',
    title: 'Baseline recovery studio',
    stageHints: ['ingest', 'validate', 'plan', 'execute', 'finalize'],
  },
  {
    templateId: 'template:chaos-safe',
    title: 'Chaos safe lab',
    stageHints: ['simulate', 'plan', 'verify', 'finalize'],
  },
  {
    templateId: 'template:strict',
    title: 'Strict audit profile',
    stageHints: ['ingest', 'validate', 'plan', 'simulate', 'observe', 'verify', 'finalize'],
  },
] as const;

const normalizeHints = <T extends readonly string[]>(hints: T): readonly string[] => [...new Set(hints)].toSorted();

export const suggestTemplateFromPluginIds = (pluginIds: readonly PluginId[]): readonly StageSuggestion[] => {
  const normalized = normalizeHints(pluginIds);
  if (normalized.some((entry) => entry.includes('simulate'))) {
    return ['simulate', 'observe'];
  }
  if (normalized.some((entry) => entry.includes('verify'))) {
    return ['plan', 'verify', 'finalize'];
  }
  return ['ingest', 'plan', 'finalize'];
};

export const templateReport = (template: StudioTemplate): StudioTemplateReport => {
  const hasPlan = template.stageHints.includes('plan');
  const hasVerify = template.stageHints.includes('verify');
  return {
    templateId: template.templateId,
    pluginCount: template.stageHints.length,
    hasPlan,
    hasVerify,
    suggestionCount: normalizeHints(template.stageHints).length,
  };
};

export const buildRunInput = (payload: StudioRunInput, overrides: Partial<StudioRunInput>): StudioRunInput => ({
  ...payload,
  ...overrides,
});

export const summarizeRunDiagnostics = (
  run: PluginExecutionResult<{
    payload: Record<string, unknown>;
    events: readonly StudioPluginEvent[];
    diagnostics: { info: number; warn: number; error: number };
  }>,
): string => {
  if (!run.ok) {
    return `failed plugin=${run.pluginId}`;
  }
  return `events=${run.payload.events.length} info=${run.payload.diagnostics.info} warn=${run.payload.diagnostics.warn} error=${run.payload.diagnostics.error}`;
};

export const templateForPlugins = <TPlugins extends readonly StudioPluginDefinition[]>(
  plugins: TPlugins,
): StudioTemplate => {
  const counts = plugins.reduce<Record<string, number>>((acc, plugin) => {
    acc[plugin.kind] = (acc[plugin.kind] ?? 0) + 1;
    return acc;
  }, {});
  const stageHints = Object.entries(counts)
    .filter((entry): entry is [string, number] => entry[1] > 0)
    .map((entry) => entry[0])
    .toSorted();

  return {
    templateId: `template:${plugins.length}:${stageHints.join('+')}`,
    title: `Generated template (${plugins.length} plugins)`,
    stageHints,
  };
};

export const canExecute = (_context: PluginRunContext, options?: PluginExecutionOptions): boolean => {
  if (options?.dryRun && _context.metadata?.tenantMode === 'sandbox') {
    return false;
  }
  return true;
};

export const normalizeContext = (context: StudioContext): StudioContext => ({
  ...context,
  metadata: {
    ...context.metadata,
    normalizedAt: new Date().toISOString(),
  },
});
