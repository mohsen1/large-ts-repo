import type { Brand } from '@shared/core';
import { buildDescriptor } from './contracts';
import { parseStrategyTuple, resolveMode, resolveLane } from './schema';
import { strategyModes, strategyLanes, asPluginId, type SessionRoute, type StrategyTuple } from './types';
import type { StrategyPlan, ScenarioIntent, PluginFingerprint } from './types';

const loadCatalog = (): {
  readonly tuples: readonly StrategyTuple[];
  readonly intents: readonly ScenarioIntent[];
} => {
  const tuples = strategyModes.flatMap((mode) =>
    strategyLanes.map((lane, index) => [mode, lane, `seed-${mode}-${lane}`, index + 1] satisfies StrategyTuple),
  ) as readonly StrategyTuple[];

  const parsed = tuples.map((tuple) => parseStrategyTuple(tuple));
  const intents: readonly ScenarioIntent[] = [
    {
      intentId: 'intent:forecast-baseline' as ScenarioIntent['intentId'],
      intentName: 'Forecast Baseline',
      target: 'baseline',
      requestedAt: new Date().toISOString(),
    },
    {
      intentId: 'intent:drift-recovery' as ScenarioIntent['intentId'],
      intentName: 'Recovery Drift',
      target: 'recovery',
      requestedAt: new Date().toISOString(),
    },
    {
      intentId: 'intent:resilience-sweep' as ScenarioIntent['intentId'],
      intentName: 'Resilience Sweep',
      target: 'resilience',
      requestedAt: new Date().toISOString(),
    },
  ];

  const prepared = parsed.map((entry) => ({
    ...entry,
    0: resolveMode(entry[0]),
    1: resolveLane(entry[1]),
  })) as readonly StrategyTuple[];

  return {
    tuples: prepared,
    intents,
  };
};

export interface RegistryBootstrapEntry {
  readonly tuple: StrategyTuple;
  readonly intent: ScenarioIntent;
}

const catalog = loadCatalog();
const seedEntries: readonly RegistryBootstrapEntry[] = catalog.tuples.map((tuple, index) => ({
  tuple,
  intent: catalog.intents[index] ?? catalog.intents[0],
}));

export const defaultBootstrapPlan: StrategyPlan = {
  planId: 'plan:auto-bootstrap' as StrategyPlan['planId'],
  sessionId: 'session:auto-bootstrap' as StrategyPlan['sessionId'],
  workspace: 'workspace:auto-bootstrap' as StrategyPlan['workspace'],
  scenario: 'scenario:auto-bootstrap' as StrategyPlan['scenario'],
  title: 'Auto bootstrap lab plan',
  lanes: ['forecast', 'resilience', 'recovery'],
  steps: [],
  metadata: {
    __schema: 'recovery-lab-intelligence-core::bootstrap' as const,
    bootstrap: true,
    source: 'seed',
    generatedAt: new Date().toISOString(),
  },
};

export const bootstrapRegistryEntries = (limit: number): readonly RegistryBootstrapEntry[] =>
  seedEntries.toReversed().slice(0, limit).toReversed();

export const bootstrapDescriptors = bootstrapRegistryEntries(3).map((entry, index) =>
  buildDescriptor(
    {
      kind: entry.tuple[0],
      id: asIntelligencePluginId(asPluginId(`bootstrap-${index}`)),
      version: `1.${index}` as Brand<string, 'PluginVersion'>,
      lane: entry.tuple[1],
      mode: entry.tuple[0],
      source: 'orchestration',
      metadata: {
        route: entry.tuple.join('/'),
        intent: entry.intent.intentId,
      },
      inputSchema: (value: unknown): value is Record<string, unknown> => typeof value === 'object',
      run: async () => ({ output: entry.tuple }),
      fingerprint: () => `fp:${entry.tuple[0]}:${entry.tuple[1]}` as PluginFingerprint,
      namespace: `simulate/${entry.tuple[0]}` as SessionRoute,
    },
    `bootstrap-${index}`,
  ),
);
const asIntelligencePluginId = (value: string): Brand<string, 'IntelligencePlugin'> =>
  value as Brand<string, 'IntelligencePlugin'>;
