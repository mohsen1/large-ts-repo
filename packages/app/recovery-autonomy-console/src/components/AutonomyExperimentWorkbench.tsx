import { useCallback, useMemo, type ReactNode } from 'react';
import { withBrand } from '@shared/core';
import {
  type ExperimentPlan,
  type SignalChannel,
  type ExperimentIntent,
  type ExperimentContext,
  type ExperimentPayload,
  makeRunId,
  makeTenantId,
} from '@domain/recovery-autonomy-experiment';
import { useAutonomyExperimentRuntime } from '../hooks/useAutonomyExperimentRuntime';
import { ExperimentStatusRibbon } from './ExperimentStatusRibbon';

interface Metric {
  readonly label: string;
  readonly value: number;
}

interface Props {
  readonly tenantId: string;
  readonly plan?: ExperimentPlan;
  readonly children?: ReactNode;
}

const format = (value: number): string => `${Math.round(value * 100)}%`;

const statusColor = (score: number) => {
  if (score >= 80) return '#16a34a';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
};

const useScore = (plan?: ExperimentPlan): number => {
  return useMemo(() => {
    if (!plan || plan.graph.length === 0) {
      return 0;
    }
    const avg = plan.graph.reduce((acc, node) => acc + node.score, 0) / plan.graph.length;
    return Math.max(0, Math.min(100, Math.round(avg * 100)));
  }, [plan]);
};

export const AutonomyExperimentWorkbench = ({ tenantId, plan, children }: Props) => {
  const runtime = useAutonomyExperimentRuntime({ tenantId });
  const score = useScore(plan);

  const nodes = plan?.graph.length ?? 0;
  const phases = plan?.sequence.length ?? 0;
  const metrics: Metric[] = useMemo(
    () => [
      {
        label: 'nodes',
        value: nodes,
      },
      {
        label: 'phases',
        value: phases,
      },
      {
        label: 'score',
        value: score,
      },
    ],
    [nodes, phases, score],
  );

  const onRun = useCallback(() => {
    if (!plan) {
      return;
    }

    void runtime.run({
      intent: {
        experimentId: withBrand(`${tenantId}:experiment`, 'ExperimentId'),
        runId: makeRunId(makeTenantId(tenantId), `workbench:${Date.now()}`),
        phase: plan.sequence.at(0) ?? 'prepare',
        seed: withBrand(`${tenantId}:seed:${Date.now()}`, 'ExperimentSeed'),
        tags: [withBrand('workbench', 'ExperimentTag')],
        source: `pilot-${plan.sequence.at(0) ?? 'prepare'}`,
        owner: tenantId,
        tenantId: makeTenantId(tenantId),
        createdAt: new Date().toISOString(),
      } as ExperimentIntent,
      context: {
        issuer: withBrand(`workbench:${tenantId}`, 'ExperimentIssuer'),
        tenantId: makeTenantId(tenantId),
        tenantLabel: `tenant:${tenantId}`,
        namespace: `autonomy:${tenantId}`,
        activePhases: plan.sequence,
        signal: `${tenantId}:signal` as SignalChannel,
      } as ExperimentContext,
      plan: plan as ExperimentPlan,
      payload: {
        strategy: `workbench-${tenantId}`,
        horizonMinutes: 30,
        metadata: { tenantId, nodes },
        channels: [`recovery:${tenantId}:workbench` as SignalChannel],
      } as ExperimentPayload,
    });
  }, [plan, runtime, tenantId, nodes]);

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header>
        <h2>Autonomy Experiment Workbench</h2>
        <p>Tenant {tenantId}</p>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {metrics.map((metric) => (
          <article
            key={metric.label}
            style={{ border: '1px solid #cbd5e1', padding: 12, borderRadius: 8 }}
          >
            <strong>{metric.label}</strong>
            <div>{metric.value}</div>
          </article>
        ))}
      </div>
      <p style={{ color: statusColor(score) }}>Health score: {format(score)}</p>
      <button type="button" disabled={runtime.loading} onClick={onRun}>
        Run Plan
      </button>
      <ExperimentStatusRibbon result={runtime.result} />
      {children}
    </section>
  );
};
