import { useMemo, useState } from 'react';
import { useTypeStressBlueprint, useTypeStressBlueprintMetrics, useBlueprintRuntime, type NoInfer } from '../../hooks/useTypeStressBlueprint';

type PanelBlueprintSeed = {
  readonly tenant: string;
  readonly region: string;
  readonly scope: 'global' | 'regional' | 'local';
};

export const TypeStressBlueprintPanel = () => {
  const {
    seed,
    registry,
    snapshot,
    branchMap,
    totalBranches,
    activeBranches,
    manual,
    setManual,
    setTenant,
    setRegion,
  } = useTypeStressBlueprint();

  const metrics = useTypeStressBlueprintMetrics(seed);
  const runtime = useBlueprintRuntime(seed as NoInfer<PanelBlueprintSeed>);
  const [scope, setScope] = useState<'global' | 'regional' | 'local'>('global');

  const orderedBranches = useMemo(
    () => Object.entries(branchMap).sort((left, right) => Number(String(right[0]).slice(-2)) - Number(String(left[0]).slice(-2))),
    [branchMap],
  );

  return (
    <section className="stress-blueprint-panel">
      <header>
        <h3>Type Stress Blueprint Panel</h3>
        <p>
          Tenant: {seed.tenant} · Region: {seed.region} · Scope: {scope}
        </p>
      </header>
      <section>
        <div>
          <label htmlFor="tenant">Tenant</label>
          <input
            id="tenant"
            value={seed.tenant}
            onChange={(event) => {
              setTenant(event.target.value);
            }}
          />
        </div>
        <div>
          <label htmlFor="region">Region</label>
          <input
            id="region"
            value={seed.region}
            onChange={(event) => {
              setRegion(event.target.value);
            }}
          />
        </div>
        <div>
          <button type="button" onClick={() => setScope('global')}>
            Global
          </button>
          <button type="button" onClick={() => setScope('regional')}>
            Regional
          </button>
          <button type="button" onClick={() => setScope('local')}>
            Local
          </button>
          <button type="button" onClick={() => setManual(!manual)}>
            Toggle Trace Mode
          </button>
        </div>
      </section>
      <section>
        <h4>Runtime Snapshot</h4>
        <ul>
          <li>Macro routes: {registry.macros.length}</li>
          <li>Hydra entries: {registry.hydra.length}</li>
          <li>Decision entries: {registry.branchMatrix.length}</li>
          <li>Layer count: {runtime.buildLayerCount}</li>
          <li>Catalog keys: {Object.keys(registry.catalogs).length}</li>
          <li>Branch score: {snapshot.score.score}</li>
          <li>Decision accepted: {activeBranches} / {totalBranches}</li>
        </ul>
      </section>
      <section>
        <h4>Derived Metrics</h4>
        <ul>
          <li>Macro count: {metrics.macroCount}</li>
          <li>Route count: {metrics.routeCount}</li>
          <li>Branch count: {metrics.branchCount}</li>
          <li>Has decisions: {String(metrics.hasDecisions)}</li>
        </ul>
      </section>
      <section>
        <h4>Branch Heatmap</h4>
        <div className="blueprint-heatmap">
          {orderedBranches.slice(0, 16).map(([code, value]: [string, number]) => {
            const isActive = Number(value) > 0;
            return (
              <span
                key={code}
                style={{
                  display: 'inline-block',
                  width: 20,
                  height: 20,
                  margin: 2,
                  background: isActive ? '#32cd32' : '#333',
                }}
                title={`${code}: ${value}`}
              />
            );
          })}
        </div>
      </section>
      <section>
        <h4>Layer Keys</h4>
        <ul>
          {runtime.layerKeys.map((layerKey) => (
            <li key={layerKey}>{layerKey}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Branches</h4>
        {snapshot.traces.slice(0, 6).map((trace, index: number) => (
          <article key={trace.code + String(index)}>
            <p>
              {trace.code}: {trace.decision.decision.accepted ? 'accepted' : 'rejected'} · next {
                trace.decision.decision.next ?? 'none'
              }
            </p>
            <p>Domain: {trace.domain}</p>
          </article>
        ))}
      </section>
    </section>
  );
};
