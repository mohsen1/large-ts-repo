import { useMemo } from 'react';
import { useSagaTimeline } from '../hooks/useSagaTimeline';
import type { SagaPlan, SagaRun, SagaPolicy } from '@domain/recovery-incident-saga';
import type { SagaRuntimeSnapshot } from '@service/recovery-incident-saga-orchestrator';
import type { ReactElement } from 'react';
import { withBrand } from '@shared/core';
import { toNamespace } from '@shared/incident-saga-core';

interface Props {
  readonly run: SagaRun;
  readonly plan: SagaPlan;
}

interface NodeMeta {
  readonly id: string;
  readonly count: number;
}

const derivePolicy = (run: SagaRun, plan: SagaPlan): SagaPolicy => ({
  id: run.policyId,
  name: `policy:${run.domain}`,
  domain: run.domain,
  enabled: true,
  confidence: 1,
  threshold: 0.5,
  steps: plan.steps,
});

const collect = (plan: SagaPlan): readonly NodeMeta[] =>
  plan.steps.reduce<readonly NodeMeta[]>((acc, step) => [...acc, { id: `${plan.runId}:${step.id}`, count: step.weight }], []);

const mapRuntime = (run: SagaRun, plan: SagaPlan): SagaRuntimeSnapshot => ({
  runId: run.id,
  state: run.steps.length > 0 ? 'running' : 'idle',
  events: plan.steps.map((step) => {
    const namespace = toNamespace(run.domain);
    return {
      eventId: withBrand(`${run.id}-${step.id}`, `event:${namespace}`),
      namespace,
      kind: `${namespace}::prepare`,
    payload: { id: step.id, weight: step.weight },
    recordedAt: new Date().toISOString(),
    tags: ['tag:prepare'],
    };
  }),
});

export const SagaNodeCard = ({ run, plan }: Props): ReactElement => {
  const bundle = useMemo(() => ({ run, plan, policy: derivePolicy(run, plan) }), [run, plan]);
  const timeline = useSagaTimeline(bundle);

  return (
    <section className="saga-node-card">
      <h4>Plan Nodes</h4>
      <p>{run.phase}</p>
      <p>{run.policyId}</p>
      <ol>
        {collect(plan).map((node) => (
          <li key={node.id}>
            {node.id} :: {node.count}
          </li>
        ))}
      </ol>
      <div className="saga-runtime-events">
        <p>{timeline.timeline.length} timeline entries</p>
        <button type="button" onClick={() => void timeline.reload()}>
          reload
        </button>
        <button type="button" onClick={() => void timeline.stop()}>
          stop
        </button>
      </div>
    </section>
  );
};
