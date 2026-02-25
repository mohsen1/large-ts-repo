import type { EcosystemAuditEvent } from './store-contract';
import {
  asPolicyId,
  type NamespaceTag,
  type RunId,
  type StageId,
  type TenantId,
  asRunId,
  asTenantId,
} from '@domain/recovery-ecosystem-core';

const now = () => new Date().toISOString();

type BaseEvent = {
  readonly at: string;
  readonly event: `event:${string}`;
  readonly stageId?: `stage:${string}`;
  readonly payload: {
    readonly index: number;
    readonly phase: string;
    readonly source: string;
  };
};

const makeSeedEvent = (run: RunId, tenant: TenantId, namespace: NamespaceTag, index: number): EcosystemAuditEvent => {
  return {
    namespace,
    runId: run,
    tenant,
    stageId: `stage:${index}` as StageId,
    event: `event:seed-${index % 3}` as `event:${string}`,
    at: now(),
    payload: {
      index,
      phase: index % 2 === 0 ? 'start' : 'progress',
    source: 'fixture',
    },
  };
};

const makeSeedEventBundle = (runId: RunId, tenant: TenantId, namespace: NamespaceTag, count: number): readonly EcosystemAuditEvent[] =>
  Array.from({ length: count }, (_value, index) => makeSeedEvent(runId, tenant, namespace, index));

const seedRuns = [
  {
    run: asRunId('seed-1'),
    tenant: asTenantId('seed-1'),
    namespace: `ns:seed:1` as NamespaceTag,
    policies: [asPolicyId('seed')],
    count: 4,
  },
  {
    run: asRunId('seed-2'),
    tenant: asTenantId('seed-2'),
    namespace: `ns:seed:2` as NamespaceTag,
    policies: [asPolicyId('seed'), asPolicyId('extended')],
    count: 5,
  },
  {
    run: asRunId('seed-3'),
    tenant: asTenantId('seed-3'),
    namespace: `ns:seed:3` as NamespaceTag,
    policies: [asPolicyId('seed'), asPolicyId('strict'), asPolicyId('compliance')],
    count: 6,
  },
];

export const bootstrappedEvents = seedRuns.flatMap((entry) => makeSeedEventBundle(entry.run, entry.tenant, entry.namespace, entry.count));

export const bootstrappedSnapshots = seedRuns.map((entry) => ({
  runId: entry.run,
  tenant: entry.tenant,
  namespace: entry.namespace,
  payload: {
    seed: true,
    policies: entry.policies,
    createdAt: now(),
    status: 'seeded',
  },
  generatedAt: now(),
}));

export const seedRunIds = seedRuns.map((entry) => entry.run);

export const seedEventForRun = (runId: string): readonly EcosystemAuditEvent[] =>
  bootstrappedEvents.filter((event) => event.runId === (runId as RunId));
