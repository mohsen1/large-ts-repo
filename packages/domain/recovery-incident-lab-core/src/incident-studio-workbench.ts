import { z } from 'zod';
import { NoInfer } from '@shared/type-level';
import { withBrand } from '@shared/core';
import type { CommandRunbook, WorkloadTarget, RecoverySignal } from '@domain/recovery-stress-lab';
import {
  buildScenarioFromRunbooks,
  buildScenarioTemplate,
  normalizeWorkloadState,
  toTopologyRoute,
} from './incident-studio-workload-adapters';
import {
  buildIncidentSignalBuckets,
  normalizeSignalWindow,
  toStudioSignalWindow,
  type SignalBucketsByClass,
} from './incident-studio-signals';
import { adaptPlanForSignals } from './incident-studio-adaptivity';
import { buildLaneManifest, buildLaneManifestSignature } from './incident-studio-lanes';
import { composeSchedule, scheduleSteps } from './incident-studio-schedule';
import {
  buildDefaultPlugins,
  IncidentLabStudioPluginRegistry,
  type AnyIncidentLabStudioPlugin,
  type StudioPluginContext,
} from './incident-studio-registry';
import type {
  IncidentLabRun,
  IncidentLabScenario,
  IncidentLabSignal,
  LabTemplateStep,
  RunId,
  StepId,
} from './types';
import {
  createStudioBlueprint,
  createStudioRoute,
  createStudioRunId,
  createStudioSessionId,
  createStudioSignalEnvelopeId,
  createWorkspaceId,
  type IncidentLabStudioBlueprint,
  type IncidentLabStudioInput,
  type IncidentLabStudioRunState,
  type IncidentLabStudioTelemetry,
  type StudioRoute,
  type StudioSessionId,
  type StudioWorkspaceId,
  type StudioRunId,
  type StudioStage,
  type StudioSessionState,
  studioWorkspaceStages,
} from './incident-studio-types';
import { IncidentLabTelemetryBuffer, type StudioTelemetryState } from './incident-studio-observability';

type WorkspaceTopology = readonly WorkloadTarget[];

const toWorkspaceStage = (stage: (typeof studioWorkspaceStages)[number]): StudioRoute => createStudioRoute('incident-lab', stage);

const WorkspaceSchema = z.object({
  tenantId: z.string().min(1),
  runbooks: z.array(
    z.object({
      id: z.string().min(1),
      tenantId: z.string().min(1),
      name: z.string().min(1),
      description: z.string().default(''),
      ownerTeam: z.string().default('incident-lab-core'),
      cadence: z.object({
        weekday: z.number(),
        windowStartMinute: z.number(),
        windowEndMinute: z.number(),
      }),
      steps: z.array(
        z.object({
          commandId: z.string().min(1),
          title: z.string().min(1),
          phase: z.string(),
          estimatedMinutes: z.number().min(0),
          prerequisites: z.array(z.string()),
          requiredSignals: z.array(z.string()),
        }),
      ),
    }),
  ),
  topology: z.array(
    z.object({
      tenantId: z.string(),
      workloadId: z.string(),
      commandRunbookId: z.string(),
      name: z.string(),
      criticality: z.number(),
      region: z.string(),
      azAffinity: z.array(z.string()),
      baselineRtoMinutes: z.number(),
      dependencies: z.array(z.string()),
    }),
  ),
  signals: z.array(
    z.object({
      id: z.string(),
      class: z.string(),
      severity: z.string(),
      title: z.string(),
      createdAt: z.string(),
      metadata: z.record(z.unknown()),
    }),
  ),
});

type WorkspaceSignals = SignalBucketsByClass<readonly ['availability', 'integrity', 'performance', 'compliance']>;

export interface WorkspaceInput {
  readonly tenantId: string;
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkspaceTopology;
  readonly signals: readonly RecoverySignal[];
}

interface WorkspaceBuildEnvelope {
  readonly workspace: IncidentLabWorkspaceInput;
}

export interface WorkbenchSnapshot {
  readonly route: StudioRoute;
  readonly stage: (typeof studioWorkspaceStages)[number];
  readonly signature: string;
}

export interface WorkbenchResult {
  readonly sessionId: StudioSessionId;
  readonly stage: (typeof studioWorkspaceStages)[number];
  readonly run: IncidentLabRun;
  readonly blueprint: IncidentLabStudioBlueprint;
  readonly snapshots: readonly WorkbenchSnapshot[];
  readonly mapSignatures: readonly string[];
  readonly report: {
    readonly status: 'ok' | 'warning' | 'degraded';
    readonly totalFrames: number;
    readonly warnings: readonly string[];
  };
}

interface IncidentLabWorkspaceInput {
  readonly tenantId: string;
  readonly sessionId: StudioSessionId;
  readonly workspaceId: StudioWorkspaceId;
  readonly runId: StudioRunId;
  readonly route: StudioRoute;
  readonly stage: StudioStage;
  readonly state: StudioSessionState;
  readonly lastStage: StudioStage;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly signalKeys: readonly string[];
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkspaceTopology;
  readonly signals: readonly RecoverySignal[];
  readonly signalWindow: readonly ReturnType<typeof toStudioSignalWindow>[];
  readonly signalBuckets: WorkspaceSignals;
  readonly topologySignature: ReturnType<typeof normalizeWorkloadState>;
  readonly inputSignals: readonly RecoverySignal[];
  readonly scenario: IncidentLabScenario;
  readonly planTemplate: ReturnType<typeof buildScenarioTemplate>;
}

interface StageReport {
  readonly status: 'ok' | 'warning' | 'degraded';
  readonly warnings: readonly string[];
}

type AdaptationMode = 'conservative' | 'balanced' | 'aggressive';

const normalizeRecoverySignalClass = (signal: { readonly class: string }): RecoverySignal['class'] => {
  const candidates: RecoverySignal['class'][] = ['availability', 'integrity', 'performance', 'compliance'];
  return candidates.includes(signal.class as RecoverySignal['class']) ? (signal.class as RecoverySignal['class']) : 'availability';
};

const buildRecoverySignalFromWindow = (signal: ReturnType<typeof toStudioSignalWindow>): RecoverySignal => ({
  id: createStudioSignalEnvelopeId(`${signal.key}:${signal.signature}`) as unknown as RecoverySignal['id'],
  class: signal.kind,
  severity: ['low', 'medium', 'high', 'critical'][Math.min(3, Math.max(0, signal.window.length))] as RecoverySignal['severity'],
  title: signal.signature,
  createdAt: signal.window.at(0)?.at ?? new Date().toISOString(),
  metadata: {
    source: 'incident-studio',
    node: signal.signature,
  },
});

const buildRecoverySignalsFromWindow = (window: readonly ReturnType<typeof toStudioSignalWindow>[]): readonly RecoverySignal[] =>
  window.flatMap((entry, index) =>
    entry.window.map(() => ({
      id: createStudioSignalEnvelopeId(`seed:${String(index)}`) as unknown as RecoverySignal['id'],
      class: normalizeRecoverySignalClass({ class: entry.kind }),
      severity: ['low', 'medium', 'high', 'critical'][Math.min(3, entry.window.length)] as RecoverySignal['severity'],
      title: `catalog:${entry.signature}`,
      createdAt: new Date().toISOString(),
      metadata: { key: entry.key },
    })),
  );

const parseWorkspaceInput = (input: NoInfer<WorkspaceInput>): WorkspaceInput =>
  WorkspaceSchema.parse(input) as unknown as WorkspaceInput;

const buildWorkspaceInput = (input: WorkspaceInput): IncidentLabWorkspaceInput => {
  const parsed = parseWorkspaceInput(input);
  const seedSignals = normalizeSignalWindow(parsed.signals);
  const signalWindow = seedSignals.map((signal) => toStudioSignalWindow(signal));
  const signalBuckets = buildIncidentSignalBuckets({
    signals: parsed.signals,
    include: ['availability', 'integrity', 'performance', 'compliance'],
  });
  const topology = toTopologyRoute(parsed.topology);
  const topologySignature = normalizeWorkloadState(
    parsed.runbooks.map((runbook, index) => ({
      runbookId: runbook.id,
      workloadCount: parsed.topology.length,
      lane: (index % 2 === 0 ? 'control' : 'compute') as 'control' | 'compute',
      updatedAt: new Date(Date.now() + index).toISOString(),
    })),
  );

  const planTemplate = buildScenarioTemplate({
    runbooks: parsed.runbooks,
    signals: parsed.signals,
    lanes: ['control', 'compute', 'network', 'safety', 'policy'],
  });
  const sessionId = createStudioSessionId(parsed.tenantId);
  const workspaceId = createWorkspaceId(parsed.tenantId);
  const runId = createStudioRunId(sessionId);
  const runbooks = parsed.runbooks;
  const seedSignalModels = buildRecoverySignalsFromWindow(signalWindow);

  return {
    tenantId: parsed.tenantId,
    sessionId,
    workspaceId,
    runId,
    stage: 'discovery',
    scenario: planTemplate.scenario,
    planTemplate,
    signalBuckets,
    signalWindow,
    topologySignature,
    topology: topology,
    signals: seedSignalModels,
    runbooks,
    route: createStudioRoute('incident-lab', 'discovery'),
    state: 'inactive' as StudioSessionState,
    lastStage: 'discovery' as StudioStage,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    signalKeys: parsed.signals.map((signal) => signal.id),
    inputSignals: parsed.signals,
  };
};

const inferMode = (signals: readonly RecoverySignal[]): AdaptationMode => {
  const criticalCount = signals.filter((signal) => signal.severity === 'critical').length;
  if (criticalCount >= 3) return 'aggressive';
  if (criticalCount >= 1) return 'balanced';
  return 'conservative';
};

const addSnapshot = (stage: (typeof studioWorkspaceStages)[number], signature: string): WorkbenchSnapshot => ({
  route: toWorkspaceStage(stage),
  stage,
  signature,
});

const buildStageReport = (mode: AdaptationMode, signals: readonly IncidentLabSignal[]): StageReport => {
  const warnings = [
    `mode=${mode}`,
    `signals=${signals.length}`,
    `signature=${signals.map((signal) => `${signal.kind}:${signal.node}`).slice(0, 8).join(',')}`,
  ];
  const status = signals.length > 24 ? 'degraded' : warnings.length > 4 ? 'warning' : 'ok';
  return { status, warnings };
};

const toRunStateId = (value: string): RunId => withBrand(`run:${value}`, 'RunId');

const buildRun = (
  adaptation: ReturnType<typeof adaptPlanForSignals>,
  windows: ReturnType<typeof composeSchedule>['windows'],
): IncidentLabRun => ({
  runId: toRunStateId(adaptation.decision.plan.id),
  planId: adaptation.decision.plan.id,
  scenarioId: adaptation.decision.plan.scenarioId,
  startedAt: new Date().toISOString(),
  completeBy: new Date(Date.now() + windows.length * 17_000).toISOString(),
  state: adaptation.decision.score > 70 ? 'active' : 'ready',
  results: adaptation.adaptiveRunbook.slice(0, 8).map((entry, index) => ({
    stepId: entry.id,
    startAt: new Date(Date.now() + index * 3_000).toISOString(),
    finishAt: new Date(Date.now() + (index + 1) * 3_000).toISOString(),
    status: index % 3 === 0 ? 'skipped' : 'done',
    logs: [entry.command, `lane=${index}`],
    sideEffects: [String(entry.owner), `${String(entry.owner)}:${index}`],
  })),
});

const runStateFor = (input: {
  readonly input: ReturnType<typeof adaptPlanForSignals>;
  readonly telemetry: {
    readonly sessionId: string;
    readonly frameCount: number;
    readonly markers: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly mode: AdaptationMode;
}): IncidentLabStudioRunState => ({
  sessionId: createStudioSessionId(input.telemetry.sessionId),
  runId: createStudioRunId(input.input.decision.plan.id),
  route: createStudioRoute('incident-lab', 'compose'),
  input: input.input,
  startedAt: new Date().toISOString(),
  outcome: input.input.decision.score > 60 ? 'success' : 'degraded',
  stage: 'compose',
});

export const runStudioWorkspace = async (input: NoInfer<WorkspaceInput>): Promise<WorkbenchResult> => {
  const workspace = buildWorkspaceInput(input);
  const snapshots: WorkbenchSnapshot[] = [];
  const telemetry = new IncidentLabTelemetryBuffer(String(workspace.sessionId), 196);
  const plugins = buildDefaultPlugins() as readonly AnyIncidentLabStudioPlugin[];
  const registry = new IncidentLabStudioPluginRegistry(plugins);
  const mode = inferMode(workspace.signals);
  const planFromRunbooks = buildScenarioFromRunbooks({
    tenantId: workspace.tenantId,
    runbooks: workspace.runbooks,
    signals: workspace.signals,
    lanes: ['control', 'compute', 'network', 'safety', 'policy'],
  });
  const laneManifest = buildLaneManifestSignature(
    buildLaneManifest({
      plan: planFromRunbooks,
      signals: workspace.signalWindow.flatMap((entry) => entry.window),
      lanes: ['control', 'compute', 'network', 'safety', 'policy'],
    }),
  );
  const scheduledPlan = composeSchedule({
    scenario: workspace.scenario,
    signalWindow: workspace.signalWindow,
    strategy: mode === 'aggressive' ? 'sla-aware' : 'dependency-first',
  });
  const scheduled = scheduleSteps({
    plan: scheduledPlan.plan,
    sort: {
      by: 'scenarioId',
      desc: false,
    },
    signals: workspace.signalWindow,
  });
  const adaptation = adaptPlanForSignals({
    mode,
    plan: scheduled.ordered.length > 0 ? scheduledPlan.plan : planFromRunbooks,
    signals: workspace.signalWindow.flatMap((entry) => entry.window),
    manifest: laneManifest,
  });

  snapshots.push(addSnapshot('seeded', laneManifest.signature));
  const pluginContext: StudioPluginContext = {
    sessionId: workspace.sessionId,
    scope: 'incident-lab-core',
    traceId: `trace:${workspace.sessionId}`,
    startedAt: new Date().toISOString(),
    includeTelemetry: true,
  };
  const runState = runStateFor({
    input: adaptation,
    telemetry: {
      sessionId: String(workspace.sessionId),
      frameCount: scheduled.snapshot.windows.length + laneManifest.snapshot.overload,
      markers: [],
      warnings: [laneManifest.signature],
    },
    mode,
  });

  await using telemetryScope = new AsyncDisposableStack();
  telemetryScope.defer(() => {
    void registry[Symbol.asyncDispose]();
  });
  telemetryScope.defer(() => {
    void telemetry[Symbol.asyncDispose]();
  });

  const pluginResult = await registry.execute(
    plugins,
    {
      scenarioId: workspace.scenario.id,
      workspace: workspace.workspaceId,
      mode,
      catalog: [{
        profile: runState.stage,
        runbookIds: scheduledPlan.plan.queue.map((step) => String(step)),
        signalCount: workspace.signalWindow.length,
        lanes: ['control', 'compute'],
      }],
      blueprintId: String(workspace.sessionId),
    },
    pluginContext,
  );

  const pluginSignature = JSON.stringify(Object.keys(pluginResult || {}).sort());
  telemetry.record('plugin', { mode, signature: pluginSignature, stage: runState.stage });
  telemetry.record('plan', { signature: scheduledPlan.plan.id, windows: String(scheduled.snapshot.windows.length) });
  telemetry.record('signal', {
    signature: laneManifest.signature,
    signalClass: workspace.signalBuckets['lane:availability'].kind,
    signalCount: workspace.signalWindow.length,
  });
  telemetry.record('lane', {
    signatures: laneManifest.snapshot.reason,
    signals: workspace.signalBuckets['lane:performance'].signature,
  });
  telemetry.loadPlan(scheduledPlan.plan);
  telemetry.loadRun(buildRun(adaptation, scheduled.snapshot.windows));
  telemetry.loadSignals(workspace.signalWindow.flatMap((frame) => frame.window));

  const timeline = telemetry.toTimeline();
  const warnings = buildStageReport(mode, workspace.signalWindow.flatMap((frame) => frame.window)).warnings;
  const run = buildRun(adaptation, scheduled.snapshot.windows);
  const report: WorkbenchResult['report'] = {
    status: timeline.frames.length > 24 ? 'degraded' : warnings.length > 4 ? 'warning' : 'ok',
    totalFrames: timeline.frames.length,
    warnings,
  };

  const blueprint = createStudioBlueprint({
    sessionId: workspace.sessionId,
    workspaceId: workspace.workspaceId,
    runId: workspace.runId,
    scenarioId: workspace.scenario.id,
    signalBuckets: ['availability', 'integrity', 'performance', 'compliance'],
    laneKinds: ['control', 'compute', 'network', 'safety', 'policy'],
  });

  const snapshotState = telemetry.snapshot();
  const state: StudioTelemetryState = snapshotState.state;
  const summarySignatures = [
    blueprint.blueprintId,
    run.runId,
    laneManifest.signature,
    ...state.warnings,
  ] satisfies readonly string[];
  snapshots.push(addSnapshot('complete', `${laneManifest.signature}:${state.frames}`));

  return {
    sessionId: workspace.sessionId,
    stage: report.status === 'degraded' ? 'degraded' : 'complete',
    run,
    blueprint,
    snapshots,
    mapSignatures: summarySignatures,
    report,
  };
};

export const runWorkspaceFromCatalog = async (input: WorkspaceInput): Promise<WorkbenchResult> =>
  runStudioWorkspace(input);

const fallbackSignalsFromCatalog = (input: {
  readonly tenantId: string;
  readonly signals: readonly RecoverySignal[];
}): readonly RecoverySignal[] =>
  input.signals.length > 0
    ? input.signals
    : [{
      id: createStudioSignalEnvelopeId(`seed:${input.tenantId}:availability`) as unknown as RecoverySignal['id'],
      class: 'availability',
      severity: 'low',
      title: 'seed-node',
      createdAt: new Date().toISOString(),
      metadata: { node: 'seed-node' },
    }];

export const runStudioWorkspaceFromSignals = async (input: WorkspaceInput): Promise<WorkbenchResult> => {
  const parsed = parseWorkspaceInput(input);
  return runStudioWorkspace({
    tenantId: parsed.tenantId,
    runbooks: parsed.runbooks,
    topology: parsed.topology,
    signals: fallbackSignalsFromCatalog({
      tenantId: parsed.tenantId,
      signals: parsed.signals,
    }),
  } as WorkspaceInput);
};
