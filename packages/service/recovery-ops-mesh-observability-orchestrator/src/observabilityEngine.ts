import { withBrand } from '@shared/core';
import {
  computeHealthWindowSignature,
  buildHealthSignal,
  buildProfileFromTopology,
  type MeshObservabilityAlert,
  isAlertSignal,
  isPulseSignal,
  isSnapshotSignal,
  isTelemetrySignal,
} from '@domain/recovery-ops-mesh';
import {
  parseTopology,
  type MeshPayloadFor,
  type MeshPlanId,
  type MeshRunId,
  type MeshSignalKind,
} from '@domain/recovery-ops-mesh';
import {
  collectObservabilityCursor,
  collectSignals,
  streamWithFilter,
  type ObservabilityRecordEnvelope,
  type ObservabilityEventRecord,
} from '@data/recovery-ops-mesh-observability-store';
import type { InMemoryObservabilityStore } from '@data/recovery-ops-mesh-observability-store';
import { z } from 'zod';
import {
  createDensityPlugin,
  createTopologyPlugin,
  executePlugins,
  pluginFingerprints,
  pluginSignatureString,
} from './plugins';
import type {
  ObservabilityConfig,
  ObservabilityReport,
  ObservabilityRun,
} from './types';
import {
  defaultWorkspaceConfig,
  parseObservabilitySignals,
} from './types';
import { withWorkspace } from './sessions';

const pluginBootstrapConfig = z
  .object({
    maxPlugins: z.number().min(1).max(64),
    namespace: z.string().min(1),
    signalThreshold: z.number().min(0).max(100),
  })
  .parse({
    maxPlugins: 16,
    namespace: 'mesh.observability.bootstrap',
    signalThreshold: 75,
  });

const bootstrapTopologySeed = {
  id: 'mesh-bootstrap-observability',
  name: 'mesh-bootstrap',
  version: '1.0.0',
  nodes: [],
  links: [],
  createdAt: Date.now(),
};

const bootstrapTopology = parseTopology(bootstrapTopologySeed);
const bootstrapPlugins = [
  createTopologyPlugin(bootstrapTopology),
  createDensityPlugin(),
];

export const bootstrapSignature = pluginSignatureString(bootstrapPlugins);

export interface AnalyzeInput {
  readonly planId: MeshPlanId;
  readonly runId: MeshRunId;
  readonly topologySeed: Parameters<typeof parseTopology>[0];
  readonly signal: MeshPayloadFor<MeshSignalKind>;
  readonly config?: Partial<ObservabilityConfig>;
}

export const analyzeTopology = async (
  input: AnalyzeInput,
): Promise<ObservabilityReport> => {
  const topology = parseTopology(input.topologySeed);
  const reportWindow = computeHealthWindowSignature(['pulse', 'snapshot', 'alert', 'telemetry'] as const);
  const profile = buildProfileFromTopology(topology);
  const runtimeNamespace = `${input.planId}-${input.runId}`;

  const runReport = await withWorkspace(topology, input.config ?? defaultWorkspaceConfig, async (workspace, context) => {
    const outputs = await executePlugins(
      workspace.plugins,
      input.signal,
      {
        ...context,
        planId: input.planId,
        runId: input.runId,
        trace: [runtimeNamespace, ...context.trace],
      },
    );

    const policySignals = outputs.flatMap((entry) => entry.output.alerts);
    if (profile.cycleRisk >= pluginBootstrapConfig.signalThreshold) {
      policySignals.push(buildHealthSignal(input.runId, input.planId, 'critical', 'bootstrap-threshold-exceeded'));
    }

    const pluginNames = outputs.map((entry) => entry.pluginName).toSorted();
    const run: ObservabilityRun = {
      id: input.runId,
      planId: input.planId,
      startedAt: Date.now(),
      reportId: withBrand(`report-${input.runId}`, 'mesh-observability-report'),
    };

    return {
      run,
      profileSignature: `${input.planId}:${profile.staleNodeIds.length}:${profile.hotPaths.length}`,
      score: Math.max(0, 100 - profile.cycleRisk - policySignals.length * 5),
      traces: [...context.trace, runtimeNamespace, ...reportWindow],
      pluginNames,
      policySignals: parseObservabilitySignals(
        ['pulse', 'snapshot', 'telemetry', 'alert'] as const,
      ),
    };
  });

  return {
    ...runReport,
    traces: [...runReport.traces, bootstrapSignature],
  };
};

const isObservabilityRecord = (
  event: ObservabilityEventRecord,
): event is ObservabilityRecordEnvelope => {
  return 'signal' in event;
};

export const collectHistory = async (
  store: InMemoryObservabilityStore,
  planId: MeshPlanId,
): Promise<readonly string[]> => {
  const events = await collectSignals(store, planId);
  const cursor = await collectObservabilityCursor(store, planId);
  const toAt = (event: ObservabilityEventRecord): number => ('signalIndex' in event ? event.at : event.emittedAt);
  const history = events.ok
    ? events.value.map((event) => `event:${toAt(event)}:${event.id}`)
    : [];

  return history
    .concat(cursor.hasMore ? [cursor.token] : [])
    .toSorted();
};

export const streamPolicyKinds = async function* (
  store: InMemoryObservabilityStore,
  planId: MeshPlanId,
  policy: Partial<ObservabilityConfig> = {},
): AsyncGenerator<string, void, void> {
  const config = { ...pluginBootstrapConfig, ...policy };
  const policyKinds = parseObservabilitySignals(config.signalThreshold > 60
    ? ['pulse', 'telemetry']
    : ['alert', 'snapshot']);

  for await (const event of streamWithFilter(store, planId, (entry) => {
    if (!isObservabilityRecord(entry)) {
      return false;
    }
    return policyKinds.includes(entry.signal.kind);
  })) {
    if (!isObservabilityRecord(event)) {
      continue;
    }
    yield `${event.signal.kind}:${entryToString(event)}`;
  }
}

const entryToString = (
  event: ObservabilityRecordEnvelope,
): string => {
  const signal = event.signal;
  if (isSnapshotSignal(signal)) {
    return signal.payload.nodes.length.toString();
  }
  if (isAlertSignal(signal)) {
    return signal.payload.reason;
  }
  if (isTelemetrySignal(signal)) {
    return Object.keys(signal.payload.metrics).length.toString();
  }
  if (isPulseSignal(signal)) {
    return `${signal.payload.value}`;
  }
  return 'unsupported';
};

export type { ObservabilityReport, ObservabilityRun };

export const pluginCatalog = pluginFingerprints(bootstrapPlugins).map((signature) => `${signature}`);
export type ObservabilityAlert = MeshObservabilityAlert;
