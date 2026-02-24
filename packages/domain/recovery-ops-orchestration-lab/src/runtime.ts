import { randomUUID } from 'node:crypto';
import type {
  OrchestrationLab,
  OrchestrationLabEnvelope,
  LabPlan,
  LabExecution,
  DomainEvent,
  OrchestrationPolicy,
} from './types';
import { buildWorkbench } from './workbench';
import { buildLabGraph, buildGraphDiagnostics, describeRoute } from './lab-graph';
import { computeConfidence } from './contracts';
import { emitTelemetrySnapshot } from './observability';
import { buildRecoveryForecast, summarizeForecast } from './forecasting';

export type RuntimePhase = 'init' | 'discovery' | 'scoring' | 'policy' | 'execution' | 'review';

export interface RuntimeState {
  readonly startedAt: string;
  readonly phase: RuntimePhase;
  readonly selectedPlan?: LabPlan['id'];
  readonly confidence: number;
}

export interface RuntimeSummary {
  readonly lab: OrchestrationLab;
  readonly envelope: OrchestrationLabEnvelope;
  readonly state: RuntimeState;
  readonly diagnostics: {
    readonly cycleCount: number;
    readonly disconnectedNodeCount: number;
    readonly maxDepth: number;
    readonly pathCount: number;
  };
  readonly telemetry: string;
    readonly planSummary: ReturnType<typeof summarizeForecast>;
}

export interface RuntimeExecution {
  readonly run: LabExecution;
  readonly timeline: readonly string[];
  readonly summary: RuntimeSummary;
}

const summarize = (lab: OrchestrationLab, execution: LabExecution): RuntimeSummary => {
  const graph = buildLabGraph(lab);
  const diagnostics = buildGraphDiagnostics(graph);
  const state: RuntimeState = {
    startedAt: new Date().toISOString(),
    phase: 'review',
    selectedPlan: execution.planId,
    confidence: lab.plans[0] ? computeConfidence({
      labId: lab.id,
      planId: lab.plans[0].id,
      readiness: 0.6,
      resilience: 0.5,
      complexity: 0.3,
      controlImpact: 0.2,
      timestamp: new Date().toISOString(),
    }) : 0,
  };

  return {
    lab,
    envelope: {
      id: `${lab.id}:envelope:${randomUUID()}` as OrchestrationLabEnvelope['id'],
      state: 'draft',
      lab,
      intent: {
        tenantId: lab.tenantId,
        siteId: 'primary',
        urgency: lab.signals.some((signal) => signal.tier === 'critical') ? 'critical' : 'normal',
        rationale: 'runtime-synthesis',
        owner: lab.tenantId,
        requestedAt: new Date().toISOString(),
        tags: ['runtime', 'synthesis'],
      },
      plans: lab.plans,
      windows: lab.windows,
      metadata: {
        startedBy: 'runtime',
        telemetry: describeRoute(lab),
      },
      revision: lab.plans.length,
    },
    state,
    diagnostics,
    telemetry: emitTelemetrySnapshot(lab),
    planSummary: summarizeForecast(buildRecoveryForecast(lab, 4)),
  };
};

const emitDomainEvent = (event: DomainEvent, lab: OrchestrationLab): void => {
  const line = [
    event.type,
    event.labId,
    event.timestamp,
  ].join(':');
  void line;
  void lab.id;
};

export const runLabRuntime = (lab: OrchestrationLab, execution: LabExecution): RuntimeExecution => {
  const selected = lab.plans.find((plan) => plan.id === execution.planId) ?? lab.plans[0];
  const workspace = buildWorkbench({
    tenant: lab.tenantId,
    lab,
    policy: {
      id: 'runtime:policy' as OrchestrationPolicy['id'],
      tenantId: lab.tenantId,
      maxParallelSteps: 8,
      minConfidence: 0.35,
      allowedTiers: ['signal', 'warning', 'critical'],
      minWindowMinutes: 5,
      timeoutMinutes: 120,
    },
  });

  emitDomainEvent({
    type: 'plan-selected',
    labId: lab.id,
    timestamp: new Date().toISOString(),
  }, lab);

  const summary = summarize(lab, execution);
  const timeline = [`phase=${execution.status}`, `selected=${summary.state.selectedPlan}`, ...workspace.planSequence.map((plan) => plan.id)];

  return {
    run: execution,
    timeline,
    summary,
  };
};
