import { randomUUID } from 'node:crypto';
import { withBrand } from '@shared/core';
import {
  buildHealthSignal,
  buildProfileFromTopology,
  type MeshObservabilityAlert,
} from '@domain/recovery-ops-mesh';
import type {
  MeshPayloadFor,
  MeshPlanId,
  MeshRunId,
  MeshSignalKind,
  MeshTopology,
} from '@domain/recovery-ops-mesh';
import { isMeshSignal } from '@domain/recovery-ops-mesh';
import type {
  ObservabilityPlugin,
  ObservabilityPluginContext,
  ObservabilityPluginResult,
  NoInfer,
} from './types';

interface PluginOutput {
  readonly score: number;
  readonly alerts: readonly MeshObservabilityAlert[];
}

const signatureFor = (namespace: string): string => `${namespace}:${randomUUID()}`;

const signalOrder = ['pulse', 'snapshot', 'alert', 'telemetry'] as const satisfies readonly MeshSignalKind[];

const hasKind = (value: unknown): value is { readonly kind: MeshSignalKind } => {
  return typeof value === 'object' && value !== null && 'kind' in value && isMeshSignal(value);
};

const signalSupport = <TKind extends MeshSignalKind>(...signals: readonly TKind[]) =>
  signals as readonly MeshSignalKind[];

export const createTopologyPlugin = (
  topology: NoInfer<MeshTopology>,
): ObservabilityPlugin<MeshPayloadFor<MeshSignalKind>, PluginOutput, 'topology'> => {
  const profile = buildProfileFromTopology(topology);

  return {
    id: withBrand(`topology-${topology.id}`, 'mesh-observability-topology'),
    name: 'obs-plugin/topology',
    version: '1.0.0',
    supports: signalSupport('pulse', 'snapshot', 'alert', 'telemetry'),
    supportsSignal(input): input is MeshPayloadFor<MeshSignalKind> {
      return hasKind(input) &&
        signalOrder.includes(input.kind) &&
        isMeshSignal(input);
    },
    async execute(input, context) {
      const risk = Math.max(0, profile.cycleRisk);
      const topSignals = profile.staleNodeIds.length + profile.hotPaths.length;
      const alerts = [
        ...(risk >= 60
          ? [buildHealthSignal(context.runId, context.planId, 'high', `risk:${risk}`)]
          : []),
        ...(topSignals >= 4
          ? [buildHealthSignal(context.runId, context.planId, 'critical', `signals:${topSignals}`)]
          : []),
      ];

      return {
        score: 100 - Math.min(100, risk + topSignals),
        alerts,
      };
    },
    signature: signatureFor('topology'),
  };
};

export const createDensityPlugin = (): ObservabilityPlugin<MeshPayloadFor<MeshSignalKind>, PluginOutput, 'density'> => {
  return {
    id: withBrand(`density-${randomUUID()}`, 'mesh-observability-density'),
    name: 'obs-plugin/density',
    version: '1.0.0',
    supports: signalSupport('pulse', 'telemetry'),
    supportsSignal(input): input is MeshPayloadFor<MeshSignalKind> {
      return hasKind(input) &&
        signalOrder.includes(input.kind) &&
        input.kind !== 'snapshot' &&
        input.kind !== 'alert' &&
        isMeshSignal(input);
    },
    async execute(signal, context): Promise<PluginOutput> {
      const score = signal.kind === 'pulse' ? 92 : 67;
      const alerts =
        score < 70
          ? [buildHealthSignal(context.runId, context.planId, 'critical', 'density-critical')]
          : [];
      return {
        score,
        alerts,
      };
    },
    signature: signatureFor('density'),
  };
};

export const executePlugins = async <
  TInput extends MeshPayloadFor<MeshSignalKind>,
  TOutput extends PluginOutput,
  TPlugins extends readonly ObservabilityPlugin<TInput, TOutput, string>[],
>(
  plugins: NoInfer<TPlugins>,
  input: TInput,
  context: ObservabilityPluginContext,
): Promise<readonly ObservabilityPluginResult<TOutput>[]> => {
  const out: ObservabilityPluginResult<TOutput>[] = [];
  for (const plugin of plugins) {
    const traceSignal = context.trace.at(-1);
    if (!traceSignal || !plugin.supports.includes(traceSignal as MeshSignalKind)) {
      continue;
    }
    if (!plugin.supportsSignal(input)) {
      continue;
    }
    const output = await plugin.execute(input, context);
    out.push({
      pluginId: plugin.id,
      pluginName: plugin.name,
      output,
    });
  }
  return out;
};

export const pluginFingerprints = <TPlugins extends readonly ObservabilityPlugin<any, any, string>[]>(
  plugins: NoInfer<TPlugins>,
): readonly string[] => plugins.map((plugin) => plugin.signature);

export const pluginSignatureString = (
  plugins: readonly { signature: string }[],
): string => plugins.map((plugin) => plugin.signature).toSorted().join(',');

export interface SnapshotContext {
  readonly planId: MeshPlanId;
  readonly runId: MeshRunId;
}

export const toSnapshot = (snapshot: SnapshotContext) =>
  `${snapshot.planId}:${snapshot.runId}:${Date.now()}` as const;
