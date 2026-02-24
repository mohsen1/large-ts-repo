import { parseManifest, parseWorkspaceInput, parseWorkspaceCommand, parseSnapshot } from './schema';
import type {
  StudioInput,
  WorkspaceCommand,
  StudioManifest,
  StudioSnapshot,
} from './schema';
import type { PluginCatalog, PluginExecutionOutput, PluginExecutionInput, PluginSpec } from '@shared/lab-simulation-kernel';
import type { SignalStudioPlan, SignalWindow, SignalBundle } from './models';
import { buildPlanFingerprint, mapPayload } from './models';

export interface StudioAdapterError {
  readonly code: 'invalid' | 'missing' | 'parse';
  readonly message: string;
}

export interface StudioAdapterResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: StudioAdapterError;
}

export const parseStudioInput = (raw: unknown): StudioAdapterResult<StudioInput> => {
  try {
    return { ok: true, value: parseWorkspaceInput(raw) };
  } catch {
    return { ok: false, error: { code: 'parse', message: 'cannot parse studio input' } };
  }
};

export const parseCommand = (raw: unknown): StudioAdapterResult<WorkspaceCommand> => {
  try {
    return { ok: true, value: parseWorkspaceCommand(raw) };
  } catch {
    return { ok: false, error: { code: 'parse', message: 'cannot parse command' } };
  }
};

export const parseManifestAdapter = (raw: unknown): StudioAdapterResult<StudioManifest> => {
  try {
    return { ok: true, value: parseManifest(raw) };
  } catch {
    return { ok: false, error: { code: 'parse', message: 'cannot parse manifest' } };
  }
};

export const parseSnapshotAdapter = (raw: unknown): StudioAdapterResult<StudioSnapshot> => {
  try {
    return { ok: true, value: parseSnapshot(raw) };
  } catch {
    return { ok: false, error: { code: 'parse', message: 'cannot parse snapshot' } };
  }
};

export const formatOutputs = (
  outputs: readonly PluginExecutionOutput<unknown>[],
): readonly string[] => outputs.map((output) => `${output.plugin}:${output.durationMs.toFixed(1)}`);

export const manifestFromBundle = (bundle: SignalBundle, plan: SignalStudioPlan): string => {
  return `${bundle.tenant}/${bundle.workspace}/${bundle.scenario}/${plan.scenario}`;
};

export const windowsToString = (windows: readonly SignalWindow[]): string =>
  windows.map((window) => `${window.from}-${window.to}:${window.samples.join(',')}`).join(' | ');

export const resultsToLines = (results: readonly PluginExecutionOutput<unknown>[]): string[] =>
  results.map((result) => `${mapPayload(result as unknown as { plugin: string; stage: any })}:${result.warnings.length}`);

export const renderManifest = (manifest: StudioManifest, input: PluginCatalog): string => {
  const plugins = input.map((plugin) => plugin.spec.name).join(',');
  return `${manifest.id} plugins=${plugins} tenant=${manifest.tenant} workspace=${manifest.workspace}`;
};

export const commandToString = (command: WorkspaceCommand): string => `${command.workspace}:${command.command}`;

export const parseOutputBundle = <T>(raw: unknown): StudioAdapterResult<T> => {
  try {
    return { ok: true, value: raw as T };
  } catch {
    return { ok: false, error: { code: 'parse', message: 'unexpected output shape' } };
  }
};

export const sampleOutputCatalog: PluginCatalog = [
  {
    spec: {
      name: 'probe.detect@v1' as PluginSpec<'probe.detect@v1'>['name'],
      stage: 'detect',
      version: '1.0',
      weight: 1,
    },
    name: 'probe.detect@v1' as any,
    stage: 'detect',
    async run(input: PluginExecutionInput): Promise<PluginExecutionOutput<unknown>> {
      return {
        plugin: input.context['plugin'] as string,
        stage: 'detect',
        durationMs: 12,
        payload: { source: 'probe', score: 0.9 },
        warnings: [],
      };
    },
  },
];

export const safeCatalog = (catalog: PluginCatalog): PluginCatalog => {
  return catalog.length > 0 ? catalog : sampleOutputCatalog;
};
