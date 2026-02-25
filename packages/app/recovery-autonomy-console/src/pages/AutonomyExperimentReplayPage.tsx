import { useEffect, useMemo, useState } from 'react';
import { useAutonomyExperimentRuntime } from '../hooks/useAutonomyExperimentRuntime';
import { ExperimentStatusRibbon } from '../components/ExperimentStatusRibbon';
import { withBrand } from '@shared/core';
import {
  createIntentTemplate,
  createContextTemplate,
  createPayloadTemplate,
  makePlanId,
  type ExperimentContext,
  type ExperimentPlan,
  type ExperimentIntent,
  type ExperimentPayload,
  type SignalChannel,
  makeTenantId,
} from '@domain/recovery-autonomy-experiment';

const buildPlan = (tenantId: string): ExperimentPlan => {
  const tenant = makeTenantId(tenantId);
  return {
    planId: makePlanId(tenant),
    tenant,
    sequence: ['recover', 'verify'],
    graph: [
      {
        nodeId: withBrand(`replay:${tenant}:0`, 'ExperimentNodeId'),
        name: 'Replay recovery',
        phase: 'recover',
        dependencies: [],
        score: 1,
        metadata: { kind: 'replay' },
      },
    ],
    payload: createPayloadTemplate(tenant, { replay: true }),
    createdAt: new Date().toISOString(),
    createdBy: tenant,
    signature: 'replay-template',
    version: withBrand(String(1), 'ExperimentPlanVersion'),
  };
};

const buildContext = (tenantId: string): ExperimentContext => {
  const template = createContextTemplate(makeTenantId(tenantId));
  return {
    ...template,
    signal: `replay:${tenantId}` as SignalChannel,
    activePhases: ['recover', 'verify'],
  };
};

const buildIntent = (tenantId: string): ExperimentIntent => {
  const template = createIntentTemplate(makeTenantId(tenantId), 'recover');
  return {
    ...template,
    owner: `recovery-autonomy-console`,
    runId: template.runId,
  };
};

const buildPayload = (tenantId: string): ExperimentPayload => ({
  ...createPayloadTemplate(makeTenantId(tenantId), { replay: true, tenant: tenantId }),
  strategy: 'replay',
  horizonMinutes: 90,
});

const buildPlanPayload = () => ({
  context: buildContext('tenant'),
  intent: buildIntent('tenant'),
  payload: buildPayload('tenant'),
  plan: buildPlan('tenant'),
});

export const AutonomyExperimentReplayPage = ({ tenantId }: { tenantId: string }) => {
  const [count, setCount] = useState(0);
  const runtime = useAutonomyExperimentRuntime({ tenantId });
  const draft = useMemo(() => ({
    intent: buildIntent(tenantId),
    context: buildContext(tenantId),
    payload: buildPayload(tenantId),
    plan: buildPlan(tenantId),
  }), [tenantId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (count > 0 && runtime.result?.ok) {
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [count, runtime.result?.ok]);

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1>Autonomy Experiment Replay</h1>
      <p>
        Replay count: {count} · status {runtime.summary}
      </p>
      <button
        type="button"
        disabled={runtime.loading}
        onClick={() => {
          setCount((next) => next + 1);
          void runtime.run(draft);
        }}
      >
        Replay
      </button>
      <button
        type="button"
        onClick={() => {
          const template = buildPlanPayload();
          void runtime.bootstrap();
        }}
      >
        Bootstrap
      </button>
      <pre>{JSON.stringify(draft.intent, null, 2)}</pre>
      <ExperimentStatusRibbon result={runtime.result} />
    </main>
  );
};
