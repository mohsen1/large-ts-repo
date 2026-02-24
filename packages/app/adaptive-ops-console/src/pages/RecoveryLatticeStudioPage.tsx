import { useMemo, useState, type ReactElement } from 'react';
import { withBrand } from '@shared/core';
import type { LatticeBlueprintManifest } from '@domain/recovery-lattice';
import { asTenantId, asRouteId } from '@domain/recovery-lattice';
import { LatticeTopologyPanel } from '../components/lattice/LatticeTopologyPanel';
import { LatticeStatusCards } from '../components/lattice/LatticeStatusCards';
import { LatticeRunLog } from '../components/lattice/LatticeRunLog';
import { useLatticeStudio } from '../hooks/useLatticeStudio';

const exampleBlueprints: readonly LatticeBlueprintManifest[] = [
  {
    tenantId: asTenantId('tenant:demo'),
    blueprintId: withBrand('blueprint:tenant:demo:base:id', 'blueprint:tenant:demo:base:id'),
    name: 'Demo Recovery Lattice',
    version: '0.4.0',
    state: 'deployed',
    route: asRouteId('ingest:demo'),
    steps: [
      {
        kind: 'ingest',
        id: withBrand('blueprint-step:demo-ingest:id', 'blueprint-step:demo-ingest:id'),
        target: 'source',
        payloadSchema: { type: 'object' },
        tags: ['ingest'],
        required: true,
      },
      {
        kind: 'transform',
        id: withBrand('blueprint-step:demo-transform:id', 'blueprint-step:demo-transform:id'),
        target: 'normalize',
        payloadSchema: { type: 'object' },
        tags: ['transform'],
        required: true,
      },
      {
        kind: 'observe',
        id: withBrand('blueprint-step:demo-observe:id', 'blueprint-step:demo-observe:id'),
        target: 'signal',
        payloadSchema: { type: 'object' },
        tags: ['observe'],
        required: true,
      },
    ],
  },
  {
    tenantId: asTenantId('tenant:demo'),
    blueprintId: withBrand('blueprint:tenant:demo:signal:id', 'blueprint:tenant:demo:signal:id'),
    name: 'Signal Integrity Lattice',
    version: '1.1.3',
    state: 'validation',
    route: asRouteId('transform:signal'),
    steps: [
      {
        kind: 'observe',
        id: withBrand('blueprint-step:signal-observe:id', 'blueprint-step:signal-observe:id'),
        target: 'metrics',
        payloadSchema: { type: 'object' },
        tags: ['observe'],
        required: true,
      },
      {
        kind: 'emit',
        id: withBrand('blueprint-step:signal-emit:id', 'blueprint-step:signal-emit:id'),
        target: 'telemetry',
        payloadSchema: { type: 'object' },
        tags: ['emit'],
        required: false,
      },
    ],
  },
];

export const RecoveryLatticeStudioPage = (): ReactElement => {
  const studio = useLatticeStudio('tenant:demo', exampleBlueprints);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const cards = useMemo(
    () =>
      studio.state.blueprints.map((blueprint) => ({
        blueprintId: `${blueprint.tenantId}:${blueprint.version}:${blueprint.name}`,
        mode: studio.state.mode,
        steps: blueprint.steps.length,
      })),
    [studio.state.blueprints, studio.state.mode],
  );

  const blueprint = studio.state.blueprints[0] ?? exampleBlueprints[0];

  return (
    <main className="recovery-lattice-studio-page">
      <header>
        <h2>Recovery Lattice Studio</h2>
        <p>Advanced topology-aware orchestration test harness</p>
      </header>

      <section className="controls">
        <select
          value={studio.state.selectedBlueprintId}
          onChange={(event) => studio.setBlueprintById(event.target.value)}
        >
          {studio.state.blueprints.map((entry) => (
            <option key={`${entry.tenantId}-${entry.name}`} value={`${entry.tenantId}:${entry.version}:${entry.name}`}>
              {entry.name}
            </option>
          ))}
        </select>

        <label>
          Route
          <input
            value={studio.state.routeId}
            onChange={(event) => studio.setRouteId(event.target.value)}
          />
        </label>

        <label>
          Mode
          <select
            value={studio.state.mode}
            onChange={(event) => {
              const value = event.target.value as 'analysis' | 'validation' | 'execution' | 'rehearsal';
              studio.setMode(value);
            }}
          >
            <option value="analysis">Analysis</option>
            <option value="validation">Validation</option>
            <option value="execution">Execution</option>
            <option value="rehearsal">Rehearsal</option>
          </select>
        </label>

        <button type="button" onClick={studio.run} disabled={studio.state.running}>
          Run
        </button>
        <button type="button" onClick={studio.stop} disabled={!studio.state.running}>
          Stop
        </button>
      </section>

      <section className="studio-body">
        <LatticeTopologyPanel
          blueprint={blueprint}
          onHoverNode={setHoveredNode}
          hoveredNode={hoveredNode}
        />

        <LatticeStatusCards
          items={cards}
          onSelect={studio.setBlueprintById}
          selectedBlueprintId={studio.state.selectedBlueprintId}
        />

        <LatticeRunLog lines={studio.state.log} onClear={() => studio.setRouteId(studio.state.routeId)} />
      </section>

      <footer>
        <small>trace: {studio.state.trace ?? 'n/a'}</small>
      </footer>
    </main>
  );
};
