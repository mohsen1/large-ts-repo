import { useMemo, useState } from 'react';
import { asBrand, type Brand as BrandType } from '@shared/typed-orchestration-core/brands';
import { useQuantumControlSuite } from '../hooks/useQuantumControlSuite';
import {
  QuantumCommandLedger,
  QuantumControlDeck,
  QuantumPolicyMatrix,
  QuantumRunExplorer,
  QuantumSignalTimeline,
} from '../components';
import type { SignalMeta, SignalWeight, QuantumInput, QuantumOutput } from '../types';
import { makeRunId, makeTenantId, makeStageFromParts, makePlanTag } from '../types';
import { allSignalWeights, summarizeSignalsByBuckets, supportedPlanShapes } from '../types';

const sampleSignals: SignalMeta[] = [
  {
    id: 'signal-1',
    tenant: makeTenantId('tenant-omega'),
    timestamp: new Date().toISOString(),
    kind: 'signal',
    weight: 'critical',
    actor: 'ingester',
    channel: 'channel-core',
    note: 'high latency',
  },
  {
    id: 'signal-2',
    tenant: makeTenantId('tenant-omega'),
    timestamp: new Date().toISOString(),
    kind: 'policy',
    weight: 'high',
    actor: 'control',
    channel: 'channel-policy',
    note: 'throttle suggested',
  },
  {
    id: 'signal-3',
    tenant: makeTenantId('tenant-omega'),
    timestamp: new Date().toISOString(),
    kind: 'metric',
    weight: 'low',
    actor: 'telemetry',
    channel: 'channel-metrics',
    note: 'low error',
  },
];

const outputSeed = (runId: string): QuantumOutput => ({
  runId: makeRunId(runId),
  executedAt: new Date().toISOString(),
  summary: `summary:${runId}`,
  stages: [
    {
      stage: makeStageFromParts('seed', 0),
      stageRunId: makeRunId(runId),
      directives: [
        {
          id: `directive:${runId}:seed`,
          command: 'synchronize',
          reason: 'seed',
          priority: 1,
          dependencies: ['seed'],
        },
      ],
      artifactPayload: {
        source: 'seed',
        directives: 1,
      },
    },
  ],
  directives: [
    {
      id: `directive:${runId}:seed`,
      command: 'synchronize',
      reason: 'seed',
      priority: 1,
      dependencies: [],
    },
  ],
  status: 'ok',
});

const bucketCounts = (signals: readonly SignalMeta[]) => {
  const output: [SignalWeight, number][] = [];
  for (const weight of allSignalWeights) {
    const count = signals.filter((entry) => entry.weight === weight).length;
    output.push([weight, count]);
  }
  return output;
};

const buildInput = (tenant: BrandType<string, 'TenantId'>, signals: readonly SignalMeta[], shape: typeof supportedPlanShapes[number]): QuantumInput => ({
  runId: makeRunId(`run-${Date.now()}`),
  tenant,
  shape,
  stage: makeStageFromParts('seed', 0),
  signals: {
    id: `envelope-${Date.now()}`,
    runId: makeRunId(`run-${Date.now()}`),
    recordedAt: new Date().toISOString(),
    values: signals,
  },
  budgetMs: 420,
});

const weights = summarizeSignalsByBuckets(sampleSignals);
const bucketTotal = weights.buckets.critical.length + weights.buckets.high.length + weights.buckets.medium.length + weights.buckets.low.length;

export const RecoveryQuantumControlSuitePage = () => {
  const tenant = asBrand('tenant-omega', 'TenantId');
  const [shapeIndex, setShapeIndex] = useState(0);
  const [compact, setCompact] = useState(false);
  const input = useMemo(
    () => buildInput(tenant, sampleSignals, supportedPlanShapes[shapeIndex % supportedPlanShapes.length]!),
    [tenant, shapeIndex],
  );

  const { state, launch, refreshOutput, buckets, seedPayload, seededSignals, isBusy } = useQuantumControlSuite(tenant, {
    includeMetrics: true,
  });

  const inputBucketCounts = useMemo(() => bucketCounts(input.signals.values), [input.signals.values]);

  const statusSummary = useMemo(
    () => [
      `tenant: ${state.tenant}`,
      `status: ${state.status}`,
      `critical: ${inputBucketCounts.find((entry: [SignalWeight, number]) => entry[0] === 'critical')?.[1] ?? 0}`,
      `high: ${inputBucketCounts.find((entry: [SignalWeight, number]) => entry[0] === 'high')?.[1] ?? 0}`,
      `totalWeight: ${buckets.totalWeight}`,
      `seedSignals: ${seededSignals.length}`,
    ],
    [buckets.totalWeight, inputBucketCounts, state.status, state.tenant, seededSignals.length],
  );

  const seedDirectiveCount = seedPayload.output.directives.length;

  return (
    <main>
      <h1>Recovery Quantum Control Suite</h1>
      <section>
        <h2>Live Input</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <button type="button" onClick={() => setShapeIndex((value) => (value + 1) % supportedPlanShapes.length)}>
            cycle shape ({makePlanTag(supportedPlanShapes[shapeIndex % supportedPlanShapes.length]!)})
          </button>
          <label>
            <input
              type="checkbox"
              checked={compact}
              onChange={(event) => setCompact(event.target.checked)}
            />
            compact matrix
          </label>
        </div>
        <QuantumSignalTimeline input={input} />
        <p>{statusSummary.join(' • ')}</p>
        <p>Seed payload directives: {seedDirectiveCount}</p>
        <p>Bucket total: {bucketTotal}</p>
        <button type="button" onClick={() => launch(input)} disabled={isBusy}>
          {isBusy ? 'Running suite...' : 'Run quantum control suite'}
        </button>
      </section>
      <section>
        <button type="button" onClick={() => refreshOutput(input)}>
          Refresh without session transition
        </button>
      </section>
      <section>
        <QuantumControlDeck
          output={state.output}
          diagnostics={state.diagnostics}
          isRunning={state.status === 'running'}
          className="quantum-control-deck"
        />
        {state.output && (
          <>
            <QuantumPolicyMatrix output={state.output} compact={compact} />
            <QuantumRunExplorer output={state.output} />
            <QuantumCommandLedger output={state.output} showReasons />
          </>
        )}
        {!state.output && (
          <p>Seed output preview: {outputSeed(state.runId ?? asBrand('run-seed-preview', 'RunId')).summary}</p>
        )}
      </section>
    </main>
  );
};
