import { useMemo } from 'react';
import type { CadenceForecast } from '@domain/recovery-fabric-cadence-core';
import { FabricCadenceControlSurface } from '../components/FabricCadenceControlSurface';
import { FabricCadenceForecastBoard } from '../components/FabricCadenceForecastBoard';
import { FabricCadenceSignalsPanel } from '../components/FabricCadenceSignalsPanel';
import { useRecoveryFabricCadenceWorkspace } from '../hooks/useRecoveryFabricCadenceWorkspace';

export const RecoveryFabricCadenceOrchestrationPage = () => {
  const { state, metrics, actions } = useRecoveryFabricCadenceWorkspace('workspace:recovery-fabric-cadence-orchestration');

  const latestForecasts = useMemo(() => {
    const forecasts: CadenceForecast[] = [];

    for (const outcome of state.outcomes) {
      if (outcome.snapshot) {
        const ratio = outcome.snapshot.signalCount > 0 ? outcome.snapshot.throughput / outcome.snapshot.signalCount : 0;
        forecasts.push({
          planId: outcome.snapshot.planId,
          trend: ratio > 1 ? 'up' : ratio > 0.5 ? 'flat' : 'down',
          expectedDurationMs: new Date(outcome.snapshot.expectedEndAt).getTime() - new Date(outcome.snapshot.startedAt).getTime(),
          confidence: Math.max(0, Math.min(1, ratio)),
          riskCurve: outcome.snapshot.completedWindows.map((_, index) => ({
            at: String(index),
            risk: Math.min(1, (index + 1) / Math.max(1, outcome.snapshot!.completedWindows.length)),
          })),
        });
      }
    }

    return forecasts;
  }, [state.outcomes]);

  return (
    <main style={{ padding: 16, color: '#ebf1fb' }}>
      <header>
        <h1>Recovery Fabric Cadence Orchestration</h1>
        <p>Coordinate node-level cadence commands with policy-aware draft execution.</p>
      </header>

      <FabricCadenceControlSurface
        state={state}
        onBuild={actions.buildDraft}
        onExecute={actions.executeDraft}
        onClose={actions.close}
        onTab={actions.setTab}
      />

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <FabricCadenceForecastBoard forecasts={latestForecasts} activePlan={state.activePlan} />
        <FabricCadenceSignalsPanel state={state} />
      </section>

      <section style={{ marginTop: 12 }}>
        <h2 style={{ margin: '0 0 8px 0' }}>Workspace metrics</h2>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {metrics.map((metric) => (
            <article
              key={metric.label}
              style={{
                border: `1px solid #263248`,
                borderLeftWidth: 6,
                borderLeftColor:
                  metric.tone === 'ok'
                    ? '#27ae60'
                    : metric.tone === 'warn'
                      ? '#f1c40f'
                      : metric.tone === 'error'
                        ? '#e74c3c'
                        : '#7f8fa6',
                borderRadius: 8,
                padding: 10,
                background: '#141d2a',
              }}
            >
              <h4 style={{ margin: '0 0 4px 0', color: '#dce4f4' }}>{metric.label}</h4>
              <strong style={{ fontSize: 22 }}>{metric.value}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
};
