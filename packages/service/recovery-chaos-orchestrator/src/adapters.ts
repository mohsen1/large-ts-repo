import type { RegistryLike, ChaosRunEvent } from './types';
import type { StageBoundary } from '@domain/recovery-chaos-lab';

export interface ExternalPluginAdapter {
  readonly name: string;
  readonly version: string;
  readonly metadata?: Record<string, unknown>;
}

export interface PluginCatalogEntry {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly plugin: string;
  readonly title: string;
}

export interface OrchestratorPluginSpec<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly plugin: TStages[number];
  readonly enabled: boolean;
}

export function mapCatalog(entries: readonly PluginCatalogEntry[]): readonly { plugin: string; namespace: string; scenarioId: string }[] {
  return entries.map((entry) => ({
    plugin: entry.plugin,
    namespace: entry.namespace,
    scenarioId: entry.scenarioId
  }));
}

export function toTypedRegistry<TPlugins extends readonly StageBoundary<string, unknown, unknown>[]>(
  ...plugins: TPlugins
): RegistryLike<TPlugins> {
  const pluginMap = new Map<string, TPlugins[number]>(plugins.map((plugin) => [plugin.name, plugin] as const));

  return {
    get(name) {
      const plugin = pluginMap.get(String(name));
      if (!plugin) {
        return undefined;
      }
      return {
        plugin: plugin.name as never,
        execute: async () => {
          return Promise.resolve({ ok: true, value: plugin.output } as const);
        }
      };
    }
  };
}

export function classifyEvents(events: readonly ChaosRunEvent[]): { readonly fatal: number; readonly total: number } {
  const fatal = events.filter((entry) => entry.kind === 'run-failed').length;
  return { fatal, total: events.length };
}
