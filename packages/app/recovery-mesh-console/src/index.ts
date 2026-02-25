import { run, runWithQueue } from '@service/recovery-ops-mesh-engine';
import { withBrand } from '@shared/core';
import { z } from 'zod';
import {
  defaultTopology,
  type MeshPayloadFor,
  type MeshSignalKind,
  meshTopologySchema,
} from '@domain/recovery-ops-mesh';
import { describeRunRequest, isAlertPayload } from './types/meshConsoleTypes';
import { MeshCommandDeck } from './components/MeshCommandDeck';
import { MeshTimeline } from './components/MeshTimeline';
import { MeshTopologyGraph } from './components/MeshTopologyGraph';
import { MeshSignalPalette } from './components/MeshSignalPalette';
import { MeshRuntimeInspector } from './components/MeshRuntimeInspector';
import { MeshRunOrchestrator } from './components/MeshRunOrchestrator';
import { MeshOrchestratorPage } from './pages/MeshOrchestratorPage';
import { MeshControlCenterPage } from './pages/MeshControlCenterPage';
import { ObservabilityStudioPage } from './pages/ObservabilityStudioPage';
import { ObservabilityPolicyTimeline } from './components/ObservabilityPolicyTimeline';
import { ObservabilityStoreInspector } from './components/ObservabilityStoreInspector';
import { ObservabilityPolicyConsole } from './components/ObservabilityPolicyConsole';
import { ObservabilitySignalExplorer } from './components/ObservabilitySignalExplorer';
import { ObservabilityWorkbenchPage } from './pages/ObservabilityWorkbenchPage';
import { useMeshEngineWorkspace } from './hooks/useMeshWorkspace';
import { useMeshSignalStream } from './hooks/useMeshSignalStream';
import { useMeshRuntimeState } from './hooks/useMeshRuntimeState';
import { useObservabilityWorkspace } from './hooks/useObservabilityWorkspace';
import { useObservabilityEngine } from './hooks/useObservabilityEngine';
import type { EngineEnvelope, MeshPlanId, MeshRunId } from '@service/recovery-ops-mesh-engine';

export {
  MeshCommandDeck,
  MeshTimeline,
  MeshTopologyGraph,
  MeshSignalPalette,
  MeshRuntimeInspector,
  MeshRunOrchestrator,
  MeshOrchestratorPage,
  MeshControlCenterPage,
  ObservabilityStoreInspector,
  ObservabilityPolicyTimeline,
  ObservabilityPolicyConsole,
  ObservabilitySignalExplorer,
  ObservabilityStudioPage,
  ObservabilityWorkbenchPage,
  useMeshEngineWorkspace,
  useObservabilityEngine,
  useMeshSignalStream,
  useMeshRuntimeState,
  useObservabilityWorkspace,
};
export * from './types/meshConsoleTypes';
export * from './services/meshStudioService';

const runInputSchema = z.object({
  planId: z.string(),
  runId: z.string(),
  kind: z.enum(['pulse', 'snapshot', 'alert', 'telemetry']),
  value: z.number().default(1),
});

const requestDefaults = {
  planId: defaultTopology.name,
  runId: `run-${Date.now()}`,
  kind: 'pulse' as MeshSignalKind,
  value: 1,
};

const validated = describeRunRequest(runInputSchema.parse(requestDefaults) as {
  kind: MeshSignalKind;
  value: number;
  runId: string;
  planId: string;
});

export const parseSignalKind = (kind: unknown): MeshSignalKind => z.enum(['pulse', 'snapshot', 'alert', 'telemetry']).parse(kind);

export const runQuickPulse = async () =>
  run(
    withBrand(validated.planId, 'MeshPlanId'),
    withBrand(`run-${Date.now()}`, 'MeshRunId'),
    {
      kind: 'pulse',
      payload: { value: validated.value },
    },
  );

export const previewTopology = () => meshTopologySchema.parse(defaultTopology);

export const launchQuickQueue = async (): Promise<readonly EngineEnvelope<MeshPayloadFor<MeshSignalKind>>[]> => {
  const payload = runWithQueue(
    withBrand(defaultTopology.name, 'MeshPlanId'),
    withBrand(`batch-${Date.now()}`, 'engine-run-token'),
    {
      kind: 'telemetry',
      payload: { metrics: { sample: 1 } },
    },
  );
  return payload;
};

export const useConsole = () => {
  const workspace = useMeshEngineWorkspace();
  const topology = previewTopology();
  return {
    ...workspace,
    topology,
    kind: parseSignalKind(workspace.lastSignal.kind),
    active: isAlertPayload(workspace.lastSignal),
  };
};
