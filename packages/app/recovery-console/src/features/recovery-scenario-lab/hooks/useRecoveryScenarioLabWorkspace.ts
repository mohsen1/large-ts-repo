import { useCallback, useMemo, useState } from 'react';
import {
  calculateConfidence,
  buildConstraintCoverage,
  buildExecutionWindows,
  buildPlanSet,
  buildExecutionGraph,
  orderExecution,
  replaySignals,
  adaptReplayToSignals,
  selectAndPlan,
  summarizeConstraintRisk,
  simulateRecoveryFlow,
  batchSimulations,
} from '@domain/recovery-scenario-orchestration';
import { withBrand } from '@shared/core';
import type {
  CandidateWindow,
  ConstraintSnapshot,
  RecoveryRun,
  RecoverySignal,
  RecoveryPlan,
  ScenarioConstraint,
  ScenarioTemplate,
  ScenarioId,
  TenantId,
} from '@domain/recovery-scenario-orchestration';
import type { RecoverySignalLike } from '../types';

interface UseRecoveryScenarioLabWorkspaceProps {
  readonly tenantId: string;
  readonly incidentId: string;
}

export interface ScenarioLabWorkspace {
  readonly tenantId: string;
  readonly incidentId: string;
  readonly candidateCount: number;
  readonly selectedTemplateId: string;
  readonly plan?: RecoveryPlan;
  readonly windows: readonly CandidateWindow[];
  readonly windowsReady: boolean;
  readonly riskScore: number;
  readonly constraintCoverage: ReturnType<typeof buildConstraintCoverage>;
  readonly runs: readonly RecoveryRun[];
  readonly snapshots: readonly RecoverySignalLike[];
  readonly readiness: number;
  readonly running: boolean;
  readonly replayCount: number;
  readonly run: () => Promise<void>;
  readonly selectTemplate: (templateId: string) => void;
  readonly clearSelection: () => void;
}

const stamp = () => new Date().toISOString();

const buildTemplate = (tenantId: string, scenarioId: string, seed: number): ScenarioTemplate => ({
  id: `${tenantId}:template:${seed}`,
  tenantId,
  scenarioId,
  title: `Scenario ${seed}`,
  intentLabels: [tenantId, scenarioId, `seed-${seed}`],
  tags: ['generated', tenantId],
  blueprint: {
    id: withBrand(`${tenantId}:blueprint:${seed}`, 'BlueprintId'),
    tenantId: withBrand(tenantId, 'TenantId'),
    scenarioId: withBrand(scenarioId, 'ScenarioId'),
    name: `Blueprint ${seed}`,
    description: 'Auto-composed orchestration blueprint',
    constraints: [
      {
        id: withBrand(`${tenantId}:constraint:${seed}`, 'ConstraintId'),
        key: `queue.depth.${seed}`,
        operator: 'gt' as ScenarioConstraint['operator'],
        threshold: 120 + (seed % 17),
        windowMinutes: 10 + (seed % 5),
      },
      {
        id: withBrand(`${tenantId}:constraint:${seed + 1}`, 'ConstraintId'),
        key: `latency.p95.${seed}`,
        operator: 'gt' as ScenarioConstraint['operator'],
        threshold: 180,
        windowMinutes: 5 + (seed % 6),
      },
    ],
    actions: [
      {
        id: withBrand(`${tenantId}:action:${seed}:1`, 'ActionId'),
        code: 'isolate',
        title: 'Isolate blast radius',
        owner: 'automation',
        commandTemplate: `isolate:${seed}:1`,
        requiredApprovals: 0,
        estimatedMinutes: 4,
        status: 'ready',
        tags: ['isolation', 'protective'],
      },
      {
        id: withBrand(`${tenantId}:action:${seed}:2`, 'ActionId'),
        code: 'stabilize',
        title: 'Stabilize upstream dependencies',
        owner: 'recovery',
        commandTemplate: `stabilize:${seed}:2`,
        requiredApprovals: 1,
        estimatedMinutes: 7,
        status: 'ready',
        tags: ['recovery', 'primary'],
      },
      {
        id: withBrand(`${tenantId}:action:${seed}:3`, 'ActionId'),
        code: 'restore',
        title: 'Restore primary path',
        owner: 'platform',
        commandTemplate: `restore:${seed}:3`,
        requiredApprovals: 2,
        estimatedMinutes: 6,
        status: 'queued',
        tags: ['restore', 'critical'],
      },
    ],
    tags: ['auto', tenantId, scenarioId],
    priority: ((seed % 5) + 1) as 1 | 2 | 3 | 4 | 5,
  },
});

export const useRecoveryScenarioLabWorkspace = ({ tenantId, incidentId }: UseRecoveryScenarioLabWorkspaceProps): ScenarioLabWorkspace => {
  const scenarioId = incidentId;
  const [selectedTemplateId, setSelectedTemplateId] = useState(`${tenantId}:template:${tenantId.length}`);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<readonly RecoveryRun[]>([]);
  const [replayCount, setReplayCount] = useState(0);
  const [selectedReplay, setSelectedReplay] = useState<readonly RecoverySignal[]>([]);

  const templates = useMemo(() => {
    return Array.from({ length: 4 }).map((_, index) => buildTemplate(tenantId, scenarioId, index + 1));
  }, [tenantId, scenarioId]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];

  const snapshots: readonly ConstraintSnapshot[] = useMemo(() => {
    return selectedTemplate.blueprint.constraints.map((constraint) => ({
      constraint,
      score: Math.max(0, 1 - (selectedTemplate.blueprint.actions.length / 10)),
      state: 'met',
      evaluatedAt: stamp(),
      windowMinutes: constraint.windowMinutes,
    }));
  }, [selectedTemplate]);

  const selection = useMemo(() => {
    const tenant = withBrand(tenantId, 'TenantId') as TenantId;
    const scenario = withBrand(scenarioId, 'ScenarioId') as ScenarioId;
    return selectAndPlan({
      templates,
      intent: {
        scenarioId: scenario,
        tenantId: tenant,
        label: `orchestrate ${tenantId}:${scenarioId}`,
        owners: ['automation'],
      },
      snapshots,
    });
  }, [scenarioId, tenantId, templates, snapshots]);

  const selectedPlan = selection.plans[0];

  const windows: readonly CandidateWindow[] = useMemo(() => {
    if (!selectedPlan) return [];
    return buildExecutionWindows(selectedPlan, snapshots);
  }, [selectedPlan, snapshots]);

  const graph = useMemo(() => {
    if (!selectedPlan) return undefined;
    return buildExecutionGraph({ plan: selectedPlan, constraints: selectedTemplate.blueprint.constraints });
  }, [selectedPlan, selectedTemplate]);

  const order = useMemo(() => {
    if (!graph) return undefined;
    return orderExecution(graph);
  }, [graph]);

  const riskScore = useMemo(() => {
    if (!selectedPlan) return 0;
    return Math.round(summarizeConstraintRisk(snapshots, selectedPlan).score);
  }, [selectedPlan, snapshots]);

  const readiness = useMemo(() => {
    return selectedPlan ? calculateConfidence(snapshots) : 0;
  }, [selectedPlan, snapshots]);

  const windowsReady = useMemo(() => {
    return !order?.cycleDetected && order?.steps.length === windows.length;
  }, [order, windows.length]);

  const replayedSignals = useMemo(() => {
    const bundle = replaySignals({
      scenarioId,
      metrics: selectedTemplate.blueprint.constraints.map((constraint) => constraint.key),
      seed: selectedTemplate.id.length + snapshots.length,
      cadenceMinutes: 2,
    });
    return adaptReplayToSignals(scenarioId, bundle);
  }, [selectedTemplate, snapshots.length, scenarioId]);

  const run = useCallback(async () => {
    if (!selectedPlan || running) return;
    setRunning(true);
    try {
      const simulation = simulateRecoveryFlow({
        plan: selectedPlan,
        signals: replayedSignals,
        snapshots,
        seed: selectedTemplate.id.length + replayedSignals.length,
        durationMinutes: Math.max(2, windows.length * 3),
      });
      setRuns(simulation.events.map((event) => ({
        id: event.runId as RecoveryRun['id'],
        planId: selectedPlan.id,
        actorId: withBrand(event.runId, 'ActorId'),
        state: 'running',
        startedAt: event.startedAt,
        updatedAt: event.startedAt,
        progress: 0,
        details: {
          actionCode: event.actionId,
          actionId: String(event.actionId),
          order: String(event.order),
        },
      })));
      setSelectedReplay(replayedSignals);
      const batch = batchSimulations(selectedPlan, snapshots, replayedSignals, 2);
      setReplayCount(batch.length);
      await Promise.resolve(simulation);
    } finally {
      setRunning(false);
    }
  }, [selectedPlan, running, snapshots, selectedTemplate.id, windows.length, replayedSignals]);

  const selectTemplate = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTemplateId(`${tenantId}:template:${tenantId.length}`);
    setRuns([]);
    setSelectedReplay([]);
    setReplayCount(0);
  }, [tenantId]);

  const constraintSnapshots: readonly RecoverySignalLike[] = useMemo(
    () =>
      snapshots.map((snapshot) => ({
        id: `${tenantId}:${snapshot.constraint.key}`,
        metric: snapshot.constraint.key,
        value: snapshot.score,
        observedAt: snapshot.evaluatedAt,
      })),
    [snapshots, tenantId],
  );

  return {
    tenantId,
    incidentId,
    candidateCount: templates.length,
    selectedTemplateId,
    plan: selectedPlan,
    windows,
    windowsReady,
    riskScore,
    constraintCoverage: snapshots.length ? buildConstraintCoverage(snapshots) : { total: 0, met: 0, violated: 0, unknown: 0 },
    runs,
    snapshots: constraintSnapshots,
    readiness,
    running,
    replayCount,
    run,
    selectTemplate,
    clearSelection,
  };
};
