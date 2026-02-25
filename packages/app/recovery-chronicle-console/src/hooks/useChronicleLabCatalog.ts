import { useMemo } from 'react';
import { asChronicleRoute, asChronicleTag, defaultRouteSamples, type ChroniclePluginId, type ChronicleRoute, type ChroniclePluginDescriptor } from '@shared/chronicle-orchestration-protocol';
import type { PlannerInput, BlueprintPhase } from '@domain/recovery-chronicle-lab-core';
import { makePlan } from '@domain/recovery-chronicle-lab-core';

export interface CatalogPluginRow {
  readonly id: ChroniclePluginId;
  readonly name: string;
  readonly supportCount: number;
  readonly version: string;
  readonly scoreHint: number;
}

export interface CatalogState {
  readonly route: ChronicleRoute;
  readonly pluginRows: readonly CatalogPluginRow[];
  readonly totalPlugins: number;
  readonly phases: readonly BlueprintPhase[];
  readonly labels: readonly string[];
}

const pluginRows = (plugins: readonly ChroniclePluginDescriptor[]): readonly CatalogPluginRow[] =>
  plugins
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .map((plugin) => ({
      id: plugin.id as ChroniclePluginId,
      name: plugin.name,
      supportCount: plugin.supports.length,
      version: plugin.version,
      scoreHint: plugin.state.latencyBudgetMs / Math.max(1, plugin.state.config.maxParallelism),
    }));

const asPhases = (route: ChronicleRoute): readonly BlueprintPhase[] =>
  ([
    'phase:boot',
    route.startsWith('chronicle://mesh') ? 'phase:policy' : 'phase:verify',
    'phase:finalize',
  ] as const)
    .toSorted((a, b) => a.localeCompare(b));

const labelsFor = (route: ChronicleRoute): readonly string[] => {
  const base = `lab:${route}`;
  const slug = asChronicleTag(base);
  return [slug, `${slug}-primary`, `${slug}-v2`];
};

export const useChronicleLabCatalog = (
  tenant: string,
  plugins: readonly ChroniclePluginDescriptor[],
): CatalogState => {
  const route = asChronicleRoute(defaultRouteSamples[tenant.length % defaultRouteSamples.length] ?? 'chronicle://studio');
  const rows = useMemo(() => pluginRows(plugins), [plugins]);
  const phases = useMemo(() => asPhases(route), [route]);

  const plan = useMemo(() => {
    const request: PlannerInput = {
      tenant,
      route: String(route),
      phases,
      plugins,
      goal: {
        kind: 'maximize-coverage',
        target: 92,
      },
      limit: 4,
    };
    return makePlan(request);
  }, [tenant, phases, plugins, route]);

  const labels = useMemo(() => labelsFor(route), [route]);

  return {
    route,
    pluginRows: rows,
    totalPlugins: rows.length,
    phases: plan.blueprint.phases,
    labels,
  };
};
