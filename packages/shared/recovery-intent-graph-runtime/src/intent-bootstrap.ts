import { makeDefaultSnapshot } from './intent-graph';
import { type IntentNodeDef, type IntentNodeId, type IntentEdge, type IntentGraphSnapshot } from './intent-graph';
import { makeIntentionId, type IntentionId, type IntentionToken } from './intent-branding';

type BootstrapPhase = 'detect' | 'classify' | 'notify';

type BootstrapNodeKind = IntentNodeDef['kind'];

const bootstrapNode = (id: string, kind: BootstrapNodeKind, title: string): IntentNodeDef => {
  return {
    id: makeIntentionId('bootstrap', id) as unknown as IntentNodeId,
    kind,
    title,
    payload: {
      title,
      kind,
      created: true,
    },
    score: 10,
    version: 1,
  };
};

const bootstrapEdges = (from: string, to: string, weight: number): IntentEdge => ({
  from: makeIntentionId('bootstrap', from) as unknown as IntentNodeId,
  to: makeIntentionId('bootstrap', to) as unknown as IntentNodeId,
  weight: (Math.max(1, weight) as unknown) as IntentEdge['weight'],
});

const seedNodes = [
  bootstrapNode('signal-ingress', 'source', 'Signal Ingress'),
  bootstrapNode('intent-classifier', 'transform', 'Intent Classifier'),
  bootstrapNode('risk-filter', 'validation', 'Risk Filter'),
  bootstrapNode('resolution-sink', 'sink', 'Resolution Sink'),
] as const satisfies readonly IntentNodeDef[];

const seedEdges = [
  bootstrapEdges('signal-ingress', 'intent-classifier', 100),
  bootstrapEdges('intent-classifier', 'risk-filter', 80),
  bootstrapEdges('risk-filter', 'resolution-sink', 50),
] as const satisfies readonly IntentEdge[];

export const bootstrapSnapshot: IntentGraphSnapshot = makeDefaultSnapshot('bootstrap', seedNodes, seedEdges);

export const bootstrapIntentionId: IntentionId<string> = makeIntentionId('bootstrap', 'default');
export const bootstrapPhases = ['detect', 'classify', 'notify'] as const satisfies readonly BootstrapPhase[];

const nodeToken = (node: IntentNodeId): IntentionToken => `node:${node}` as IntentionToken;
export { nodeToken };
