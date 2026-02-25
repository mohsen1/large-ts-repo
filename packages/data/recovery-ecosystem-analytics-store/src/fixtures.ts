import type { AnalyticsStoreSignalEvent, AnalyticsStoreRunRecord } from './store-contract';
import { asSession, asWindow, type AnalyticsRun, asTenant, asNamespace } from '@domain/recovery-ecosystem-analytics';
import { toTuple, type NoInfer } from '@shared/type-level';
import { parseSignalEvent, parseRunRecord } from './serializer';

const fixtureRunSeed = {
  runId: 'run:seed:fixture' as `run:${string}`,
  tenant: asTenant('fixture-tenant'),
  namespace: asNamespace('fixture-namespace'),
  window: asWindow('fixture-window'),
  session: asSession('seed-run'),
  startedAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
  completedAt: new Date('2025-01-01T00:00:01.000Z').toISOString(),
  status: 'complete',
  stages: [
    {
      stage: 'stage:ingest' as const,
      startedAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
      completedAt: new Date('2025-01-01T00:00:00.100Z').toISOString(),
      status: 'done' as const,
      diagnostics: ['seed', 'fixture'],
    },
  ],
  metadata: {
    scenario: 'fixture-latency',
  },
} as const;

const fixtureEventsSeed = [
  {
    id: 'event:1',
    kind: 'signal:ingest',
    runId: fixtureRunSeed.runId,
    session: fixtureRunSeed.session,
    tenant: fixtureRunSeed.tenant,
    namespace: fixtureRunSeed.namespace,
    window: fixtureRunSeed.window,
    payload: { phase: 'seed', value: 42, confidence: 0.95 },
    at: new Date('2025-01-01T00:00:00.040Z').toISOString(),
  },
  {
    id: 'event:2',
    kind: 'signal:score',
    runId: fixtureRunSeed.runId,
    session: fixtureRunSeed.session,
    tenant: fixtureRunSeed.tenant,
    namespace: fixtureRunSeed.namespace,
    window: fixtureRunSeed.window,
    payload: { phase: 'seed', value: 87, confidence: 0.97 },
    at: new Date('2025-01-01T00:00:00.080Z').toISOString(),
  },
] as const;

export const resolveFixtureRunId = (tenant = 'fixture-tenant' as const): AnalyticsRun =>
  (`run:fixture:${tenant}` as const) as AnalyticsRun;

export const defaultWindow = asWindow('fixture-default');
export const defaultSession = asSession('fixture-window');

const toRun = parseRunRecord(fixtureRunSeed);
const events = fixtureEventsSeed.map((entry) => parseSignalEvent(entry));

export const fixtureRun = toRun;
export const fixtureEvents = toTuple(events as NoInfer<readonly AnalyticsStoreSignalEvent[]>);
export const fixtureWindow = defaultWindow;
export const fixtureSession = defaultSession;

export const fixtureRunRecord = (): AnalyticsStoreRunRecord => fixtureRun;

export const fixtureRecords = (): readonly AnalyticsStoreSignalEvent[] => events;
