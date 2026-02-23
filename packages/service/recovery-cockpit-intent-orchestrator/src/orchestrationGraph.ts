import {
  RecoveryIntent,
  IntentEnvelope,
  IntentTimeline,
  IntentId,
  logIntentActivated,
  logIntentMonitoring,
  logIntentCompleted,
} from '@domain/recovery-cockpit-orchestration-core';
import { InMemoryIntentStore } from '@data/recovery-cockpit-intent-store';

type CockpitAnalytics = { refresh(): Promise<void> };

export type DirectedIntent = Readonly<{
  intentId: string;
  parents: ReadonlyArray<string>;
  children: ReadonlyArray<string>;
}>;

export type IntentGraph = Readonly<{
  nodes: ReadonlyArray<RecoveryIntent>;
  edges: ReadonlyArray<DirectedIntent>;
}>;

export const buildGraphFromTimeline = (intentId: IntentId): DirectedIntent[] => [];

export type SchedulerTick = Readonly<{
  tick: number;
  scheduledAt: string;
  total: number;
}>;

export type GraphReport = {
  started: number;
  inFlight: number;
  completed: number;
  errors: string[];
};

export class IntentGraphEngine {
  constructor(
    private readonly store: InMemoryIntentStore,
    private readonly analytics: CockpitAnalytics,
  ) {}

  async build(): Promise<IntentGraph> {
    const snapshot = await this.store.listIntents();
    if (!snapshot.ok) {
      return { nodes: [], edges: [] };
    }
    const nodes = [...snapshot.value];

    const edges = nodes.map<DirectedIntent>((node) => ({
      intentId: node.intentId,
      parents: [],
      children: nodes
        .filter((candidate) => candidate.intentId !== node.intentId && candidate.scope === node.scope)
        .map((candidate) => candidate.intentId)
        .slice(0, 2),
    }));

    return { nodes, edges };
  }

  async heartbeat(logsByIntent: ReadonlyMap<IntentId, IntentTimeline>): Promise<GraphReport> {
    const report: GraphReport = { started: 0, inFlight: 0, completed: 0, errors: [] };
    for (const [intentId, timeline] of logsByIntent) {
      const snapshot = await this.store.getIntent(intentId);
      if (!snapshot.ok) continue;
      const intent = snapshot.value;
      if (!intent) {
        report.errors.push(`Missing intent ${intentId}`);
        continue;
      }
      if (intent.status === 'active') {
        report.inFlight += 1;
      }
      if (intent.status === 'completed') {
        report.completed += 1;
      }
      if (intent.status === 'scheduled') {
        report.started += 1;
      }
    }

    await this.analytics.refresh();
    return report;
  }
}

export const scheduleIntentGraph = async (
  store: InMemoryIntentStore,
  analytics: CockpitAnalytics,
): Promise<RecoveryIntent['intentId'][]> => {
  const engine = new IntentGraphEngine(store, analytics);
  const graph = await engine.build();
  const eventsByIntent = new Map<IntentId, IntentTimeline>(
    graph.nodes.map((node) => ({ intentId: node.intentId, events: [] })).map((timeline) => [timeline.intentId, timeline]),
  );
  const envelopeMap = await engine.heartbeat(eventsByIntent);
  void envelopeMap;
  return graph.nodes.filter((node) => node.status !== 'completed' && node.status !== 'aborted').map((node) => node.intentId);
};

export const applyEnvelope = (store: InMemoryIntentStore, envelope: IntentEnvelope, timeline: IntentTimeline): IntentTimeline[] => {
  const out: IntentTimeline[] = [
    logIntentActivated(timeline, envelope.intent),
    logIntentMonitoring(timeline, envelope.intent),
    envelope.intent.status === 'completed' ? logIntentCompleted(timeline, envelope.intent) : timeline,
  ];
  return out.filter((entry) => entry.intentId !== '');
};
