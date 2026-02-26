import { useHorizonObservability } from '../hooks/useHorizonObservability';
import { HorizonObservabilityDashboard } from '../components/horizon-observability/HorizonObservabilityDashboard';
import { HorizonObservabilityPulseStrip } from '../components/horizon-observability/HorizonObservabilityPulseStrip';
import { HorizonObservabilitySignalHeatmap } from '../components/horizon-observability/HorizonObservabilitySignalHeatmap';

export const HorizonObservabilityStudioPage = () => {
  const {
    tenantId,
    owner,
    profile,
    refreshMs,
    busy,
    stageWindow,
    latest,
    summaries,
    stages,
    availableProfiles,
    error,
    setTenant,
    setOwner,
    setProfile,
    setRefreshMs,
    setStage,
    run,
    refreshNow,
  } = useHorizonObservability();

  const heatmapSignals = latest?.trace.flatMap((stage) => ({
    stage,
    stageMeta: `${tenantId}:${stage}:${owner}`,
    signal: {
      kind: stage as any,
      payload: {},
      input: {
        runId: latest.runId,
        tenantId,
        version: `${tenantId}-${latest.runId}`,
        stage,
        tags: ['studio'],
        metadata: { owner },
      },
      id: `${tenantId}-${stage}-${latest.runId}`,
      startedAt: new Date(latest.elapsedMs).toISOString(),
      severity: 'low',
    },
    manifest: {
      tenantId,
      stage: stage as any,
      fingerprint: `${tenantId}:${stage}:${latest.runId}` as any,
      windowId: `${tenantId}:${latest.runId}` as any,
      metricId: `${tenantId}:metric:${latest.runId}` as any,
      planId: `${tenantId}:plan:${latest.runId}` as any,
    },
    fingerprint: `${tenantId}:${stage}:${latest.runId}` as any,
    trace: [stage],
  })) as any;

  return (
    <main className="horizon-observability-studio">
      <header>
        <h1>Horizon Observability Studio</h1>
      </header>

      <section className="control-row">
        <label>
          Tenant
          <input value={tenantId} onChange={(event) => setTenant(event.target.value)} />
        </label>
        <label>
          Owner
          <input value={owner} onChange={(event) => setOwner(event.target.value)} />
        </label>
        <label>
          Profile
          <select value={profile} onChange={(event) => setProfile(event.target.value as any)}>
            {availableProfiles.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="mode-row">
        <HorizonObservabilityDashboard
          tenantId={tenantId}
          profile={profile}
          summaries={summaries}
          trace={latest?.trace ?? []}
          error={error}
        />

        <div className="actions">
          <button type="button" onClick={run} disabled={busy}>
            Run now
          </button>
          <button type="button" onClick={refreshNow} disabled={busy}>
            Baseline
          </button>
          <div className="stage-switches">
            {stages.map((stage) => {
              const active = stageWindow.includes(stage);
              return (
                <button
                  key={stage}
                  type="button"
                  className={active ? 'active' : 'inactive'}
                  onClick={() => setStage(stage)}
                >
                  {stage}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <HorizonObservabilityPulseStrip
        profiles={availableProfiles}
        refreshMs={refreshMs}
        summaries={summaries}
        onRefresh={setRefreshMs}
      />

      <HorizonObservabilitySignalHeatmap
        tenantId={tenantId}
        signals={heatmapSignals}
        selected={stageWindow as any}
        onSelect={(value) => setStage(value)}
      />
    </main>
  );
};
