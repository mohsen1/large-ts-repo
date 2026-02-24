import { ReadinessLabPluginCatalog } from '@domain/recovery-readiness';
import type { ReadinessLabExecutionInput, ReadinessLabExecutionOutput, ReadinessLabStep } from '@domain/recovery-readiness';

export interface ReadinessLabUiPluginConfig {
  readonly pluginId: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly step: ReadinessLabStep;
}

interface ReadinessLabUiPluginRuntime {
  readonly id: string;
  readonly step: ReadinessLabStep;
  readonly execute: (input: ReadinessLabExecutionInput) => Promise<ReadinessLabExecutionOutput>;
}

const manifest: ReadonlyArray<ReadinessLabUiPluginConfig> = [
  { pluginId: 'discover-core', label: 'Discover', enabled: true, step: 'discover' },
  { pluginId: 'triage-core', label: 'Triage', enabled: true, step: 'triage' },
  { pluginId: 'validate-core', label: 'Validate', enabled: true, step: 'validate' },
  { pluginId: 'simulate-core', label: 'Simulate', enabled: true, step: 'simulate' },
  { pluginId: 'execute-core', label: 'Execute', enabled: false, step: 'execute' },
];

const pluginRuntime = (entry: ReadinessLabUiPluginConfig): ReadinessLabUiPluginRuntime => ({
  id: entry.pluginId,
  step: entry.step,
  execute: async (input) => ({
    runId: input.context.runId,
    planId: `${input.plan.planId}:${entry.step}` as ReadinessLabExecutionOutput['planId'],
    generatedSignals: input.plan.signals.slice(0, (entry.label.length % 3) + 1),
    warnings: [`ui-plugin:${entry.pluginId}:run:${input.context.runId}`],
  }),
});

const disabledPlugin = (entry: ReadinessLabUiPluginConfig) => ({
  ...pluginRuntime(entry),
  execute: async () => ({
    runId: `${entry.pluginId}:${entry.step}` as ReadinessLabExecutionOutput['runId'],
    planId: `${entry.pluginId}:disabled` as ReadinessLabExecutionOutput['planId'],
    generatedSignals: [],
    warnings: ['disabled'],
  }),
});

const adapter = (entry: ReadinessLabUiPluginConfig) => ({
  kind: entry.pluginId.replace(/-core$/, '') as ReadinessLabUiPluginConfig['step'],
  tag: 'ui' as const,
  step: entry.step,
  metadata: {
    pluginId: entry.pluginId,
    displayName: entry.label,
    version: '1.0.0',
    supportedChannels: ['signal', 'telemetry'] as const,
  },
  execute: entry.enabled ? pluginRuntime(entry).execute : disabledPlugin(entry).execute,
});

const pluginDescriptors = manifest.map((entry) => adapter(entry));

export const readinessLabCatalog = new ReadinessLabPluginCatalog(pluginDescriptors);
export const activePluginIds = pluginDescriptors.filter((entry) => entry.metadata.pluginId).map((entry) => entry.metadata.pluginId);
export const configuredPluginCount = pluginDescriptors.length satisfies number;

export const buildOrderedSteps = (): ReadonlyArray<ReadinessLabStep> => {
  const enabled = pluginDescriptors.filter((plugin) => plugin.metadata.version === '1.0.0').map((plugin) => plugin.step);
  const fallback: ReadinessLabStep[] = ['discover', 'triage', 'simulate', 'review'];
  return enabled.length > 0 ? enabled : fallback;
};
