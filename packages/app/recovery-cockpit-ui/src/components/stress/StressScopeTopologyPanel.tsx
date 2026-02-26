import { useMemo, useState } from 'react';
import {
  chainFactory,
  flattenDeepNode,
  requiresDepth40,
} from '@shared/type-level/stress-hierarchy-depth-ship';
import { configureSolver, solverTrace } from '@shared/type-level/stress-constraint-orchestration-grid';
import {
  buildPortCollection,
  mapPortTelemetry,
} from '@shared/type-level/stress-disjoint-mapped-ports';

const portEntries = [
  {
    id: 'port-atlas-1',
    label: 'control-router',
    zone: 'zone-north',
    healthy: true,
    queueDepth: 4,
    activeAt: Date.now(),
    tags: ['atlas', 'control'],
  },
  {
    id: 'port-mesh-2',
    label: 'mesh-dispatch',
    zone: 'zone-core',
    healthy: false,
    queueDepth: 18,
    activeAt: Date.now() - 1000,
    tags: ['mesh', 'dispatch'],
  },
  {
    id: 'port-policy-3',
    label: 'policy-engine',
    zone: 'zone-east',
    healthy: true,
    queueDepth: 9,
    activeAt: Date.now() - 4000,
    tags: ['policy', 'telemetry'],
  },
  {
    id: 'port-saga-4',
    label: 'saga-bridge',
    zone: 'zone-west',
    healthy: false,
    queueDepth: 31,
    activeAt: Date.now() - 7000,
    tags: ['saga', 'recovery'],
  },
];

const solverSeed = configureSolver('runtime', 'plan', { name: 'runtime-seed', level: 1 });
const solverNode = configureSolver('runtime', 'execute', { name: 'runtime-root', level: 4 }, 'critical');

export const StressScopeTopologyPanel = () => {
  const [hops, setHops] = useState(4);
  const [mode, setMode] = useState<'expanded' | 'collapsed'>('expanded');

  const chain = useMemo(() => chainFactory('scope-chain', 10, hops), [hops]);
  const chainNode = useMemo(
    () => ({
      label: chain.getLabel(),
      depth: (chain as { depth: number }).depth,
      deep: requiresDepth40({
        node01: 1,
        node02: 2,
        node03: 3,
        node04: 4,
        node05: 5,
        node06: 6,
        node07: 7,
        node08: 8,
        node09: 9,
        node10: 10,
        node11: 11,
        node12: 12,
        node13: 13,
        node14: 14,
        node15: 15,
        node16: 16,
        node17: 17,
        node18: 18,
        node19: 19,
        node20: 20,
        node21: 21,
        node22: 22,
        node23: 23,
        node24: 24,
        node25: 25,
        node26: 26,
        node27: 27,
        node28: 28,
        node29: 29,
        node30: 30,
        node31: 31,
        node32: 32,
        node33: 33,
        node34: 34,
        node35: 35,
        node36: 36,
        node37: 37,
        node38: 38,
        node39: 39,
        node40: 40,
      }),
      flat: flattenDeepNode({
        node01: 1,
        node02: 2,
        node03: 3,
        node04: 4,
        node05: 5,
        node06: 6,
        node07: 7,
        node08: 8,
        node09: 9,
        node10: 10,
        node11: 11,
        node12: 12,
        node13: 13,
        node14: 14,
        node15: 15,
        node16: 16,
        node17: 17,
        node18: 18,
        node19: 19,
        node20: 20,
        node21: 21,
        node22: 22,
        node23: 23,
        node24: 24,
        node25: 25,
        node26: 26,
        node27: 27,
        node28: 28,
        node29: 29,
        node30: 30,
        node31: 31,
        node32: 32,
        node33: 33,
        node34: 34,
        node35: 35,
        node36: 36,
        node37: 37,
        node38: 38,
        node39: 39,
        node40: 40,
      } as any),
    }),
    [chain],
  );

  const ports = useMemo(() => buildPortCollection(portEntries), []);
  const mapped = useMemo(() => mapPortTelemetry(ports), [ports]);
  const mappedRows = useMemo(() => Array.from(mapped.map.values()), [mapped]);

  const constraints = useMemo(() => {
    const trace = solverTrace('runtime', 'plan');
    return {
      items: trace.items.length,
      ratio: trace.ratio,
      totalLevel: trace.summary.levelTotal,
      debug: trace.trace,
    };
  }, []);

  return (
    <section style={{ border: '1px solid #5d7097', borderRadius: 12, padding: 12, background: '#0b1330' }}>
      <header style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Scope topology panel</h3>
        <button type="button" onClick={() => setMode((value) => (value === 'expanded' ? 'collapsed' : 'expanded'))}>
          {mode}
        </button>
        <button type="button" onClick={() => setHops((value) => Math.max(1, Math.min(10, value + 1)))}>
          hops={hops}
        </button>
      </header>
      <div>chain-label: {chainNode.label}</div>
      <div>chain-depth: {chainNode.depth}</div>
      <div>chain-flat-count: {chainNode.flat.keys.length}</div>
      <div>
        solver seed:
        {' '}
        {solverSeed.token}
      </div>
      <div>
        solver node:
        {' '}
        {solverNode.token}
      </div>
      <div>
        solver ratio:
        {' '}
        {constraints.ratio.toFixed(3)}
      </div>
      <div>
        constraints:
        {' '}
        {constraints.items}/{constraints.totalLevel}
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8 }}>
        {mappedRows.map((entry) => (
          <div
            key={entry.portId}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 6 }}
          >
            <span>{entry.portId}</span>
            <span>{entry.healthy ? 'ok' : 'down'}</span>
            <span>{entry.latencyMs}ms</span>
          </div>
        ))}
      </div>
      {mode === 'expanded' ? (
        <details>
          <summary>diagnostic trace</summary>
          <ul>
            {constraints.debug.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
};
