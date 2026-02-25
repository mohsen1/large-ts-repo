import { useMemo } from 'react';
import { asScenarioProfileId, type SynthesisWorkspace } from '@domain/recovery-scenario-lens';
import { collectIterable, type SynthesisTelemetryFrame } from '@shared/recovery-synthesis-runtime';
import { analyzeWorkspace } from '@domain/recovery-scenario-lens/synthesis-workspace-intelligence';
import type { PlaybookPolicyHint } from '@service/recovery-synthesis-orchestrator/quantum-playbook';
import { computeAffinity, pickPlaybookProfile } from '@service/recovery-synthesis-orchestrator/quantum-playbook';
import type { ScenarioProfile } from '@domain/recovery-scenario-lens';
import { asMillis } from '@domain/recovery-scenario-lens';

type Category = 'plan' | 'simulate' | 'govern' | 'store' | 'alert';

type EventMetric = {
  readonly category: Category;
  readonly count: number;
};

interface DerivedMetric {
  readonly commandCount: number;
  readonly candidateCount: number;
  readonly runCount: number;
}

export interface QuantumSynthesisAnalytics {
  readonly runtimeId: SynthesisWorkspace['runtimeId'] | undefined;
  readonly runCount: number;
  readonly commandDensity: number;
  readonly affinity: number;
  readonly commandMetrics: readonly EventMetric[];
  readonly warnings: readonly string[];
  readonly snapshotLabel: string;
  readonly profileHint: PlaybookPolicyHint | undefined;
}

const asCategory = (kind: string): Category => {
  if (
    kind === 'plan' ||
    kind === 'simulate' ||
    kind === 'govern' ||
    kind === 'store' ||
    kind === 'alert'
  ) {
    return kind;
  }
  return 'plan';
};

const toMetricRecord = (entries: readonly { readonly kind: string }[]): Record<Category, number> => {
  const result = { plan: 0, simulate: 0, govern: 0, store: 0, alert: 0 } satisfies Record<Category, number>;
  for (const entry of entries) {
    result[asCategory(entry.kind)] += 1;
  }
  return result;
};

const toWorkspaceTelemetry = (workspace: SynthesisWorkspace | undefined): readonly SynthesisTelemetryFrame[] => {
  if (!workspace) {
    return [];
  }

  return collectIterable(
    workspace.events.map((event, index) => ({
      id: event.traceId,
      at: event.when,
      stage: `stage:${index}` as const,
      plugin: 'plugin:workspace' as const,
      payload: { event },
      latencyMs: event.kind.length + index,
    })),
  );
};

export const useQuantumSynthesisAnalytics = (workspace: SynthesisWorkspace | undefined): QuantumSynthesisAnalytics => {
  const metrics = useMemo(() => toMetricRecord(workspace?.events ?? []), [workspace?.events]);

  const commandCount = workspace?.latestOutput?.plan.commandIds.length ?? 0;
  const candidateCount = workspace?.latestOutput?.readModel.candidates.length ?? 0;
  const runCount = workspace?.latestOutput?.readModel.activePlan?.commandIds.length ?? workspace?.events.length ?? 0;

  const derived = useMemo<DerivedMetric>(
    () => {
      const commandMetrics = Object.values(metrics);
      const count = commandMetrics.reduce((sum, value) => sum + value, 0);
      return {
        commandCount,
        candidateCount,
        runCount: commandCount ? count : runCount,
      };
    },
    [commandCount, candidateCount, runCount, metrics],
  );

  const planHints = useMemo(() => {
    const constraints = workspace?.latestOutput?.plan.constraints ?? [];
    const profiles = constraints.map<ScenarioProfile>((constraint) => ({
      profileId: asScenarioProfileId(`profile.${constraint.constraintId}`),
      name: constraint.description,
      maxParallelism: 2,
      maxBlastRadius: constraint.limit,
      maxRuntimeMs: asMillis(1_000),
      allowManualOverride: true,
      policyIds: [constraint.constraintId],
    }));

    return pickPlaybookProfile(profiles);
  }, [workspace?.latestOutput?.plan.constraints]);

  const affinity = useMemo(() => {
    const slots = workspace?.timeline ?? [];
    const planSlots = slots.map((slot, index) => ({
      slotIndex: index,
      command: slot.commandOrder[0],
      planAffinity: Math.max(0.1, 1 - index * 0.05),
    }));

    return planSlots.length === 0 ? 0 : computeAffinity(planSlots);
  }, [workspace?.timeline]);

  const fallbackLabel = useMemo(() => {
    if (!workspace?.latestOutput) {
      return 'no workspace output';
    }
    const analysis = analyzeWorkspace({
      workspace,
      constraints: workspace.latestOutput.readModel.activePlan?.constraints ?? workspace.latestOutput.readModel.candidates.flatMap((candidate) => candidate.windows.flatMap(() => [])),
    });

    return analysis.warnings.join(' | ');
  }, [workspace]);

  const profileHint = planHints
    ? ({
      incidentSeverity: 'critical' as const,
      tenant: planHints.policyIds[0] ?? 'default',
      region: 'global',
      services: ['synthesis', 'orchestrator'],
    } as PlaybookPolicyHint)
    : undefined;

  return {
    runtimeId: workspace?.runtimeId,
    runCount: derived.runCount,
    commandDensity: derived.commandCount === 0 ? 0 : derived.candidateCount / derived.commandCount,
    affinity,
    commandMetrics: [
      { category: 'plan', count: metrics.plan },
      { category: 'simulate', count: metrics.simulate },
      { category: 'govern', count: metrics.govern },
      { category: 'store', count: metrics.store },
      { category: 'alert', count: metrics.alert },
    ],
    warnings: workspace?.latestOutput?.plan.warnings.slice(0, 6) ?? ['no-workspace'],
    snapshotLabel: fallbackLabel,
    profileHint,
  };
};
