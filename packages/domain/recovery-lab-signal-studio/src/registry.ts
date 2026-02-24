import type {
  PluginCatalog,
  PluginContract,
  PluginExecutionInput,
  PluginExecutionOutput,
  PluginStage,
} from '@shared/lab-simulation-kernel';
import { summarizePlugins, type TenantId, type RunId, type WorkspaceId, type ScenarioId } from './models';
import type { NoInfer } from '@shared/type-level';

export interface StudioWorkspaceState {
  readonly workspace: string;
  readonly pluginFilter?: readonly string[];
  readonly selectedScenario: string;
  readonly includeTelemetry: boolean;
}

export interface StudioBundle {
  readonly tenant: TenantId;
  readonly workspace: WorkspaceId;
  readonly runId: RunId;
  readonly scenario: ScenarioId;
}

export interface RegistryView<TCatalog extends PluginCatalog> {
  readonly pluginCount: number;
  readonly byStage: ReturnType<typeof summarizePlugins>;
  readonly catalog: TCatalog;
  readonly latest: TCatalog[number]['name'][];
}

export type PluginByStage<T extends PluginCatalog, Stage extends PluginStage> = Extract<
  T[number],
  { stage: Stage }
>;

export const buildRegistryView = <TCatalog extends PluginCatalog>(catalog: NoInfer<TCatalog>): RegistryView<TCatalog> => {
  const byStage = summarizePlugins(catalog);
  const pluginNames = catalog.map((plugin) => plugin.name);
  const latest = [...pluginNames].reverse();
  return {
    pluginCount: catalog.length,
    byStage,
    catalog,
    latest,
  };
};

export const executeByStage = async <TInput, TOutput, TCatalog extends PluginCatalog>(
  stage: NoInfer<PluginStage>,
  catalog: TCatalog,
  input: PluginExecutionInput<TInput>,
  run: (plugin: PluginByStage<TCatalog, typeof stage>, output: PluginExecutionOutput<TOutput>) => void,
): Promise<PluginExecutionOutput<TOutput>[]> => {
  const output: PluginExecutionOutput<TOutput>[] = [];
  for (const plugin of catalog) {
    if (plugin.stage !== stage) {
      continue;
    }
    const result = (await plugin.run(input)) as PluginExecutionOutput<TOutput>;
    run(plugin as PluginByStage<TCatalog, typeof stage>, result);
    output.push(result);
  }
  return output;
};

export const buildPlugins = <TCatalog extends PluginCatalog>(catalog: TCatalog): TCatalog => catalog;

export interface PluginLaneSummary {
  readonly lane: PluginStage;
  readonly names: readonly string[];
}

export const pluginLanes = <TCatalog extends PluginCatalog>(catalog: TCatalog): readonly PluginLaneSummary[] => {
  const byStage = summarizePlugins(catalog);
  return (Object.entries(byStage) as [PluginStage, readonly string[]][]).map(([lane, names]) => ({
    lane,
    names,
  }));
};
