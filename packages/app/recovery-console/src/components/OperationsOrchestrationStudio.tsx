import { useMemo } from 'react';
import { withBrand } from '@shared/core';
import type { RecoverySignal, RecoveryConstraintBudget } from '@domain/recovery-operations-models';
import type { ServiceDependencyNode } from '@domain/recovery-operations-models/dependency-map';
import type { RunPlanSnapshot } from '@domain/recovery-operations-models';

import { planHorizon, buildHorizonReport, type HorizonWindow } from '@service/recovery-operations-engine/horizon-planner';
import {
  detectAnomalies,
  buildRhythmProfile,
  summarizeRhythmProfile,
} from '@domain/recovery-operations-models/incident-rhythm';

interface ServiceDependency {
  readonly id: string;
  readonly owner: string;
  readonly region: string;
}

interface OrchestrationStudioProps {
  readonly tenant: string;
  readonly candidatePlans: readonly { id: string; name: string; steps: number }[];
  readonly signals: readonly RecoverySignal[];
  readonly dependencies: readonly ServiceDependency[];
}

interface PlanRow {
  readonly planId: string;
  readonly name: string;
  readonly steps: number;
  readonly runnable: boolean;
  readonly note: string;
}

const buildMockPlan = (input: { id: string; name: string; steps: number }): RunPlanSnapshot => {
  const steps = Array.from({ length: input.steps }, (_, index) => ({
    command: `cmd-${index}`,
    timeoutMs: 60_000,
    id: `${input.id}-step-${index}`,
    title: `Step ${index + 1}`,
    dependencies: index === 0 ? [] : [`${input.id}-step-${index - 1}`],
    requiredApprovals: 0,
    tags: ['generated'],
  }));

  const constraints: RecoveryConstraintBudget = {
    maxParallelism: Math.min(8, Math.max(1, steps.length)),
    maxRetries: 2,
    timeoutMinutes: 45,
    operatorApprovalRequired: steps.length < 2,
  };

  return {
    id: withBrand(input.id, 'RunPlanId'),
    name: input.name,
    program: {
      id: withBrand(`program-${input.id}`, 'RecoveryProgramId'),
      tenant: withBrand('tenant', 'TenantId'),
      service: withBrand('ops-service', 'ServiceId'),
      name: input.name,
      description: 'generated in studio',
      priority: 'gold',
      mode: 'restorative',
      window: {
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        timezone: 'UTC',
      },
      topology: {
        rootServices: [],
        fallbackServices: [],
        immutableDependencies: [],
      },
      constraints: [],
      steps,
      owner: `owner-${input.id}`,
      tags: ['studio'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    constraints,
    fingerprint: {
      tenant: withBrand('tenant', 'TenantId'),
      region: 'us-east-1',
      serviceFamily: 'ops',
      impactClass: 'infrastructure',
      estimatedRecoveryMinutes: 30,
    },
    sourceSessionId: undefined,
    effectiveAt: new Date().toISOString(),
  };
};

const buildServiceNodes = (dependencies: readonly ServiceDependency[]): readonly ServiceDependencyNode[] => {
  return dependencies.map((dependency) => ({
    id: withBrand(dependency.id, 'ServiceId'),
    owner: dependency.owner,
    region: dependency.region,
    criticality: Math.min(100, dependency.id.length * 7),
    recoveredBySlaSeconds: 120,
    state: dependency.owner === 'core' ? 'active' : 'new',
  }));
};

const buildServiceEdges = (dependencies: readonly ServiceDependency[]) => {
  return dependencies
    .flatMap((dependency, index) => {
      const next = dependencies[index + 1];
      if (!next) return [] as const;
      return [{
        from: dependency.id,
        to: next.id,
        reliabilityScore: 0.9,
        isHardDependency: dependency.region !== 'eu-west-1',
      }];
    });
};

const buildRows = (window: HorizonWindow): readonly PlanRow[] => {
  return window.plans.map((candidate) => ({
    planId: candidate.candidate.id,
    name: String(candidate.candidate.name ?? `plan-${candidate.candidate.id}`),
    steps: candidate.lanes.length,
    runnable: candidate.state !== 'blocked',
    note: `${candidate.state} · ${candidate.window.timezone}`,
  }));
};

export const OperationsOrchestrationStudio = ({
  tenant,
  candidatePlans,
  signals,
  dependencies,
}: OrchestrationStudioProps) => {
  const plans = candidatePlans.map((plan) => buildMockPlan(plan));
  const nodes = useMemo(() => buildServiceNodes(dependencies), [dependencies]);
  const edges = useMemo(() => buildServiceEdges(dependencies), [dependencies]);

  const horizon = useMemo(() => {
    const window = planHorizon({
      tenant: withBrand(tenant, 'TenantId'),
      candidatePlans: plans,
      dependencyNodes: nodes,
      dependencyEdges: edges,
      filter: {},
    });
    return window;
  }, [tenant, plans, nodes, edges]);

  const rhythmProfile = useMemo(() => {
    const rhythm = buildRhythmProfile(withBrand(tenant, 'TenantId'), signals, 'hour');
    const summary = summarizeRhythmProfile(rhythm);
    const anomalies = detectAnomalies(rhythm);

    return {
      summary,
      anomalies,
    };
  }, [tenant, signals]);

  const rows = useMemo(() => buildRows(horizon), [horizon]);
  const report = useMemo(() => buildHorizonReport(horizon), [horizon]);

  return (
    <section className="orchestration-studio">
      <header>
        <h3>Operations orchestration studio</h3>
        <p>{tenant}</p>
      </header>
      <p>{report}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.planId}>
            <strong>{row.name}</strong>
            <span>{` · steps=${row.steps} · runnable=${row.runnable}`}</span>
            <em>{` · ${row.note}`}</em>
          </li>
        ))}
      </ul>
      <div>
        <h4>Rhythm summary</h4>
        <div>Total signals: {rhythmProfile.summary.totalSignals}</div>
        <div>Bucket count: {rhythmProfile.summary.bucketCount}</div>
        <div>Trend: {rhythmProfile.summary.weightedAverageSeverity.toFixed(3)}</div>
        <div>Anomalies: {rhythmProfile.anomalies.length}</div>
      </div>
      <ul>
        {rhythmProfile.anomalies.map((_, index) => (
          <li key={String(index)}>anomaly</li>
        ))}
      </ul>
    </section>
  );
};
