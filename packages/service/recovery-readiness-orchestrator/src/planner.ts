import { foldSignals } from '@domain/recovery-readiness/src/signals';
import { validatePlanTargets, validateRiskBand, canRunParallel, pickPolicyBand, targetCriticalityScoreFallback } from '@domain/recovery-readiness/src/policy';
import { detectOverlaps, remainingCapacity, type TimeWindow } from '@domain/recovery-readiness/src/schedules';
import type {
  RecoveryReadinessPlan,
  RecoveryReadinessPlanDraft,
  ReadinessSignal,
  ReadinessTarget,
  ReadinessDirective,
  ReadinessRunId,
  ReadinessWindow
} from '@domain/recovery-readiness';

export interface DependencyGraph {
  directive: ReadinessDirective;
  prerequisites: string[];
}

export interface ReadinessPlanBlueprint {
  draft: RecoveryReadinessPlanDraft;
  targetMap: Record<ReadinessRunId, ReadinessTarget>;
  directives: ReadinessDirective[];
  windows: RecoveryReadinessPlan['windows'];
  riskBand: ReturnType<typeof pickPolicyBand>;
}

export interface ReadinessSlaEnvelope {
  targetId: ReadinessTarget['id'];
  requiredWindowMinutes: number;
  residualCapacity: number;
  overlaps: number;
}

export function buildPlanBlueprint(draft: RecoveryReadinessPlanDraft, policyTargets: ReadinessTarget[]): ReadinessPlanBlueprint {
  const targetMap = Object.fromEntries(policyTargets.map((target) => [target.id, target]));
  const directives = draft.directiveIds.map((directiveId, index) => ({
    directiveId,
    name: `directive-${index}`,
    description: `Directive from policy ${directiveId}`,
    timeoutMinutes: 15,
    enabled: true,
    retries: 2,
    dependsOn: []
  }));

  const windows: RecoveryReadinessPlan['windows'] = policyTargets.map((target) => ({
    windowId: `wnd:${target.id}` as ReadinessWindow['windowId'],
    label: `${target.name} readiness window`,
    fromUtc: new Date().toISOString(),
    toUtc: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    timezone: 'UTC'
  }));

  return {
    draft,
    targetMap,
    directives,
    windows,
    riskBand: 'green'
  };
}

export function projectDependencies(directives: ReadinessDirective[]): DependencyGraph[] {
  const lookup = new Map(directives.map((directive) => [directive.directiveId, directive] as const));
  return directives.map((directive) => {
    const prerequisites = directive.dependsOn
      .map((dependency) => dependency.directiveId)
      .filter((dependencyId) => lookup.has(dependencyId));

    return {
      directive,
      prerequisites
    };
  });
}

export function evaluateReadinessReadiness(
  signals: ReadinessSignal[],
  targets: ReadinessTarget[],
  policy: Parameters<typeof validatePlanTargets>[0]
): { plan: ReadinessPlanBlueprint; canRun: boolean; reasons: string[] } {
  const summary = foldSignals(signals);
  const reasons: string[] = [];

  const planTemplate: ReadinessPlanBlueprint = {
    draft: {
      runId: summary.runId,
      title: 'Derived readiness blueprint',
      objective: 'Sustained service continuity',
      owner: 'orchestrator',
      targetIds: targets.map((target) => target.id),
      directiveIds: []
    },
    targetMap: Object.fromEntries(targets.map((target) => [target.id, target])),
    directives: [],
    windows: targets.map((target) => ({
      windowId: `derived:${target.id}` as ReadinessWindow['windowId'],
      label: `${target.name}-run-window`,
      fromUtc: new Date().toISOString(),
      toUtc: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      timezone: 'UTC'
    })),
    riskBand: pickPolicyBand(policy as any, signals)
  };

  const validation = validatePlanTargets(policy as any, { targets });
  const riskValidation = validateRiskBand(policy as any, signals);

  if (!validation.valid) {
    reasons.push(...validation.failures.map((failure) => `target-${failure.rule}: ${failure.message}`));
  }

  if (!riskValidation.valid) {
    reasons.push(...riskValidation.failures.map((failure) => `risk-${failure.rule}: ${failure.message}`));
  }

  const overlaps = detectOverlaps(asTimeWindows(planTemplate.windows));
  if (overlaps.length > 0) {
    reasons.push(`overlap:${overlaps.length}`);
  }

  const canRun = reasons.length === 0 && canRunParallel({
    planId: 'temp-plan',
    runId: summary.runId,
    title: 'temp',
    objective: 'temp',
    state: 'approved',
    createdAt: new Date().toISOString(),
    signals,
    targets,
    windows: planTemplate.windows,
    riskBand: planTemplate.riskBand,
    metadata: { owner: policy.name, tags: [] }
  } as unknown as RecoveryReadinessPlan, policy as any);

  const sla: ReadinessSlaEnvelope[] = targets.map((target) => ({
    targetId: target.id,
    requiredWindowMinutes: 30,
      residualCapacity: remainingCapacity(
        asTimeWindow(
          planTemplate.windows[0] ?? {
          windowId: `derived:${target.id}` as ReadinessWindow['windowId'],
          label: `${target.name}-run-window`,
          fromUtc: new Date().toISOString(),
          toUtc: new Date().toISOString(),
          timezone: 'UTC'
        }
      )
    ),
    overlaps: detectOverlaps(asTimeWindows(planTemplate.windows)).length
  }));

  if (sla.some((entry) => entry.residualCapacity < 0)) {
    reasons.push('insufficient-window-capacity');
  }

  const totalCriticality = Object.values(targetMap(planTemplate.targetMap)).reduce((sum, target) => {
    return sum + targetCriticalityScoreFallback(target);
  }, 0);

  if (totalCriticality > 1000) {
    reasons.push('target-complexity-high');
  }

  return {
    plan: planTemplate,
    canRun: canRun && reasons.length === 0,
    reasons
  };
}

function targetMap(targets: Record<ReadinessRunId, ReadinessTarget>): ReadinessTarget[] {
  return Object.values(targets);
}

function asTimeWindow(window: ReadinessWindow): TimeWindow {
  const start = new Date(window.fromUtc).getTime();
  const end = new Date(window.toUtc).getTime();
  const capacityMinutes = Math.max(1, (end - start) / (1000 * 60));
  return {
    startUtc: window.fromUtc,
    endUtc: window.toUtc,
    owner: window.label,
    capacity: capacityMinutes
  };
}

function asTimeWindows(windows: ReadinessWindow[]): TimeWindow[] {
  return windows.map(asTimeWindow);
}
