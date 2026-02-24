import { withBrand } from '@shared/core';
import { type ReactElement, useCallback, useMemo, useState, useTransition } from 'react';
import {
  createOrchestrationService,
  type PluginExecutionReport,
  type PluginOrchestrationInput,
  type PluginOrchestrationPlan,
} from '@service/recovery-stress-lab-orchestrator';
import {
  pluginKinds,
  pluginStages,
  type PluginManifest,
  type PluginKind,
  type PluginRoute,
} from '@domain/recovery-incident-lab-core';
import type { JsonValue } from '@shared/type-level';

type DemoConfig = Record<string, JsonValue>;

export interface PluginOrchestratorState {
  readonly tenantId: string;
  readonly namespace: string;
  readonly plan: PluginOrchestrationPlan | null;
  readonly reports: readonly PluginExecutionReport[];
  readonly status: 'idle' | 'running' | 'ready' | 'failed';
  readonly selectedKind: PluginKind;
  readonly route: PluginRoute;
}

type HookOptions = {
  readonly tenantId?: string;
  readonly namespace?: string;
};

type HookState = {
  status: PluginOrchestratorState['status'];
  selectedKind: PluginKind;
  reports: PluginExecutionReport[];
  plan: PluginOrchestrationPlan | null;
};

const defaultKind: PluginKind = pluginKinds[0];
const defaultRoute: PluginRoute = '/recovery/recovery-incident-lab/workflow' as PluginRoute;

const buildDemoManifest = <K extends PluginKind>(
  kind: K,
  index: number,
): PluginManifest<K, DemoConfig, 'demo'> => {
  const namespace = `incident-lab-${index}`;
  const timestamp = new Date().toISOString();

  const manifest = {
    id: withBrand(`demo:${kind}:${index}`, 'PluginManifestId'),
    namespace: withBrand(namespace, 'PluginNamespace'),
    kind,
    route: '/recovery/demo' as PluginRoute,
    version: '1.0.0',
    title: `${kind}-${index}`,
    tags: [
      withBrand(`plugin:${kind}:${index}`, `plugin-tag:${kind}`),
      withBrand(`seed:${kind}:${index}`, `plugin-tag:${kind}`),
    ],
    states: ['idle', 'warming', 'running', 'done', 'stopped'],
    dependencies: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    enabled: true,
    runId: withBrand(`${namespace}:${kind}:${timestamp}`, 'PluginRunId'),
    capabilities: [],
    config: {
      kind,
      sampling: 0.5,
      emits: [['metric', `${kind}.metric`]],
      rules: [],
      model: `${kind}-simulation`,
      confidence: 87,
      iterations: 8,
      stages: pluginStages,
      timeoutMs: 800,
      endpoints: [],
      quorum: 2,
      allowParallel: true,
      breakOn: [['warning', 7]],
      fallback: 'skip',
    },
  } as unknown as PluginManifest<K, DemoConfig, 'demo'>;

  return manifest;
};

const buildSeedManifests = (kinds: readonly PluginKind[]): readonly PluginManifest[] =>
  kinds.flatMap((kind, index) => [buildDemoManifest(kind, index), buildDemoManifest(kind, index + 100)]);

const createInput = (
  tenantId: string,
  namespace: string,
  kind: PluginKind,
): PluginOrchestrationInput => {
  const manifests = buildSeedManifests([kind]);
  return {
    tenantId,
    runId: `${tenantId}-run-${Date.now()}`,
    namespace,
    manifestInputs: manifests,
    route: defaultRoute,
    mode: 'adaptive',
    input: { kind, count: manifests.length },
  };
};

const runResultRows = (report: PluginExecutionReport): PluginExecutionReport => ({
  ...report,
  plan: report.plan,
});

const buildStateElement = (snapshot: HookState): ReactElement => {
  const planText = snapshot.plan ? `${snapshot.plan.specs} specs / ${snapshot.plan.edges} edges` : 'n/a';
  return (
    <div className="recovery-plugin-orchestrator-state">
      <div>status: {snapshot.status}</div>
      <div>kind: {snapshot.selectedKind}</div>
      <div>reports: {snapshot.reports.length}</div>
      <div>plan: {planText}</div>
    </div>
  );
};

export const useRecoveryLabPluginOrchestrator = ({
  tenantId = 'tenant-default',
  namespace = 'incident-lab-console',
}: HookOptions = {}): {
  readonly state: PluginOrchestratorState;
  readonly stateElement: ReactElement;
  readonly run: () => Promise<void>;
  readonly changeKind: (kind: PluginKind) => void;
  readonly seedKinds: readonly PluginKind[];
} => {
  const service = useMemo(() => createOrchestrationService(), []);
  const [isPending] = useTransition();
  const [snapshot, setSnapshot] = useState<HookState>({
    status: 'idle',
    selectedKind: defaultKind,
    reports: [],
    plan: null,
  });

  const run = useCallback(async () => {
    setSnapshot((previous) => ({ ...previous, status: 'running' }));
    const payload = createInput(tenantId, namespace, snapshot.selectedKind);
    const plan = await service.buildPlan(payload);
    setSnapshot((previous) => ({ ...previous, plan }));

    for await (const report of service.execute(payload)) {
      setSnapshot((previous) => ({
        ...previous,
        status: isPending ? 'running' : 'ready',
        reports: [...previous.reports, runResultRows(report)],
        plan,
      }));
    }

    setSnapshot((previous) => ({ ...previous, status: 'ready' }));
  }, [namespace, snapshot.selectedKind, service, tenantId, isPending]);

  const changeKind = useCallback((kind: PluginKind) => {
    setSnapshot((previous) => ({ ...previous, selectedKind: kind }));
  }, []);

  const state: PluginOrchestratorState = {
    tenantId,
    namespace,
    plan: snapshot.plan,
    reports: snapshot.reports,
    status: snapshot.status,
    selectedKind: snapshot.selectedKind,
    route: defaultRoute,
  };

  const stateElement = buildStateElement(snapshot);

  return {
    state,
    stateElement,
    run,
    changeKind,
    seedKinds: pluginKinds,
  };
};
