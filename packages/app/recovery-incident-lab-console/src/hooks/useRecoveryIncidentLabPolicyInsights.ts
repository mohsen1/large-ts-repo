import { useMemo } from 'react';
import type {
  IncidentLabPlan,
  IncidentLabRun,
  IncidentLabScenario,
  LabEventBus,
  IncidentLabSignal,
  LabTemplateStep,
} from '@domain/recovery-incident-lab-core';
import { type OrchestratorOutput } from '@service/recovery-incident-lab-orchestrator';
import { type RecoveryIncidentLabRepository } from '@data/recovery-incident-lab-store';

export interface PolicyInsightWindow {
  readonly window: string;
  readonly score: number;
  readonly recommendations: readonly string[];
}

export interface PolicyInsightsInput {
  readonly scenario?: IncidentLabScenario;
  readonly plan?: IncidentLabPlan;
  readonly run?: OrchestratorOutput['run'];
  readonly repository: RecoveryIncidentLabRepository;
  readonly statusText?: string;
}

export interface PolicyInsightsOutput {
  readonly scenarioRiskScore: number;
  readonly policyDensity: number;
  readonly topologyCoverage: number;
  readonly executionHealth: 'healthy' | 'degraded' | 'failed' | 'idle';
  readonly nextActionPlan: readonly string[];
  readonly windows: readonly PolicyInsightWindow[];
  readonly eventBus: LabEventBus<PolicyInsightsOutput>;
  readonly signalDigest: {
    readonly total: number;
    readonly critical: number;
    readonly high: number;
    readonly medium: number;
    readonly low: number;
  };
}

const rankSeverity = (signal: IncidentLabSignal): number => {
  if (signal.kind === 'integrity') {
    return 4;
  }
  if (signal.kind === 'capacity') {
    return 3;
  }
  if (signal.kind === 'latency') {
    return 2;
  }
  return 1;
};

const normalize = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
};

const scoreFromRun = (run: IncidentLabRun | null): number => {
  if (!run) {
    return 0;
  }
  if (run.state === 'aborted' || run.state === 'completed') {
    return 100;
  }
  if (run.state === 'cooldown') {
    return 75;
  }
  return 50;
};

const buildWindows = (steps: readonly LabTemplateStep[]): PolicyInsightWindow[] => {
  if (steps.length === 0) {
    return [
      {
        window: 'initial',
        score: 0,
        recommendations: ['No steps found; create baseline plan first'],
      },
    ];
  }

  const chunk = Math.max(1, Math.ceil(steps.length / 3));
  const windows: PolicyInsightWindow[] = [];

  for (let start = 0; start < steps.length; start += chunk) {
    const chunkSteps = steps.slice(start, start + chunk);
    const weighted = chunkSteps.reduce((sum, step) => sum + step.expectedDurationMinutes, 0);
    const severity = chunkSteps.reduce((sum, step) => sum + step.constraints.length + step.expectedDurationMinutes * 0.3, 0);
    const score = normalize(100 - Math.max(0, weighted - 10) * 2 - severity);
    const recommendations = chunkSteps.map((step) => `Validate ${step.label} owner ${step.owner}`);
    windows.push({
      window: `${String(start / chunk + 1).padStart(2, '0')}-${chunkSteps.length}`,
      score,
      recommendations: recommendations.length > 0 ? recommendations : ['No step actions'],
    });
  }

  return windows;
};

const classify = (score: number, statusText?: string): PolicyInsightsOutput['executionHealth'] => {
  if (score >= 80 && (!statusText || statusText === 'completed')) {
    return 'healthy';
  }
  if (score >= 50 && (!statusText || statusText === 'running')) {
    return 'degraded';
  }
  if (score >= 1) {
    return 'failed';
  }
  return 'idle';
};

const buildSignals = (run: OrchestratorOutput['run'] | undefined): readonly IncidentLabSignal[] => {
  if (!run) {
    return [];
  }

  return run.results.map((result) => ({
    kind: 'dependency',
    node: result.stepId,
    value: scoreFromRun(run),
    at: result.startAt,
  })) as readonly IncidentLabSignal[];
};

export const useRecoveryIncidentLabPolicyInsights = ({ scenario, plan, run, statusText }: PolicyInsightsInput): PolicyInsightsOutput => {
  const scenarioSignals = useMemo(() => buildSignals(run), [run]);

  const scenarioRiskScore = useMemo(() => {
    const base = plan?.selected.length ?? 0;
    const signals = scenarioSignals.length;
    const high = scenarioSignals.filter((signal) => signal.value >= 80).length;
    const medium = scenarioSignals.filter((signal) => signal.value >= 50).length;
    return normalize(100 - base * 2 + (signals === 0 ? 20 : 0) - high * 6 - medium * 2);
  }, [plan?.selected, scenarioSignals]);

  const policyDensity = useMemo(() => {
    if (!plan || !scenario) {
      return 0;
    }
    const selectedRatio = normalize((plan.selected.length / Math.max(1, scenario.steps.length)) * 100);
    return Math.min(100, selectedRatio + (plan.queue.length > 0 ? 10 : 0));
  }, [plan, scenario]);

  const topologyCoverage = useMemo(() => {
    const planned = new Set(plan?.selected ?? []);
    const total = scenario?.steps.length ?? 0;
    if (total === 0) {
      return 0;
    }
    return normalize((planned.size / total) * 100);
  }, [plan?.selected, scenario?.steps.length]);

  const executionHealth = classify(scenarioRiskScore, statusText);

  const nextActionPlan = useMemo(() => {
    const actions: string[] = [];
    if (!scenario) {
      actions.push('Load scenario before scheduling');
      return actions;
    }
    if (plan?.state === 'draft') {
      actions.push('Finalize plan and set ordered queue');
    }
    if (plan && plan.queue.length === 0) {
      actions.push('Populate execution queue from selected steps');
    }
    if (scenarioRiskScore < 50) {
      actions.push('Inject synthetic signals and rerun validation');
    }
    if (executionHealth === 'failed') {
      actions.push('Run recovery simulation with reduced concurrency');
    }
    if (topologyCoverage < 70) {
      actions.push('Cover uncovered dependencies by expanding selected runbook scope');
    }
    actions.push('Archive run artifact and refresh governance snapshot');
    return actions;
  }, [executionHealth, plan, scenario, scenarioRiskScore, topologyCoverage]);

  const windows = useMemo(() => buildWindows(scenario?.steps ?? []), [scenario?.steps]);

  const signalDigest = useMemo(() => ({
    total: scenarioSignals.length,
    critical: scenarioSignals.filter((signal) => rankSeverity(signal) === 4).length,
    high: scenarioSignals.filter((signal) => rankSeverity(signal) === 3).length,
    medium: scenarioSignals.filter((signal) => rankSeverity(signal) === 2).length,
    low: scenarioSignals.filter((signal) => rankSeverity(signal) === 1).length,
  }), [scenarioSignals]);

  const eventBus: LabEventBus<PolicyInsightsOutput> = {
    publish: () => undefined,
    subscribe: (handler) => {
      handler({
        scenarioRiskScore,
        policyDensity,
        topologyCoverage,
        executionHealth,
        nextActionPlan,
        windows,
        eventBus,
        signalDigest,
      });
      return () => undefined;
    },
  };

  return {
    scenarioRiskScore,
    policyDensity,
    topologyCoverage,
    executionHealth,
    nextActionPlan,
    windows,
    eventBus,
    signalDigest,
  };
};
