import { HorizonLabControlPanel } from '../components/horizon/HorizonLabControlPanel';
import { HorizonLabSummary } from '../components/horizon/HorizonLabSummary';
import { HorizonLabTimeline } from '../components/horizon/HorizonLabTimeline';
import { useHorizonLab } from '../hooks/useHorizonLab';

export const HorizonLabPage = () => {
  const {
    tenantId,
    selectedStages,
    availableStages,
    canRun,
    busy,
    lastRun,
    lastError,
    summary,
    windows,
    timelines,
    refreshMs,
    setTenant,
    setRefreshMs,
    toggle,
    run,
    refresh,
  } = useHorizonLab();

  return (
    <main className="horizon-lab-page">
      <header>
        <h1>Recovery Horizon Lab</h1>
      </header>

      <p>
        This page runs synthetic horizon workflows with dynamic stage wiring, emits strongly-typed plans, and displays
        signal diagnostics over live tenant windows.
      </p>

      <HorizonLabControlPanel
        tenantId={tenantId}
        selected={selectedStages}
        available={availableStages}
        canRun={canRun}
        busy={busy}
        refreshMs={refreshMs}
        lastError={lastError}
        onTenantChange={setTenant}
        onRefreshMsChange={setRefreshMs}
        onToggleStage={toggle}
        onRun={run}
        onRefresh={refresh}
      />

      <section className="grid two-col">
        <HorizonLabSummary
          tenantId={tenantId}
          signalCount={summary?.signalCount}
          planCount={summary?.planCount}
          selected={selectedStages}
          lastRun={
            lastRun
              ? {
                  at: lastRun.at,
                  run: lastRun.run,
                  signalCount: lastRun.signalCount,
                  stages: lastRun.stages,
                }
              : undefined
          }
          timelines={timelines}
        />

        <aside>
          <h3>Quick Stats</h3>
          <dl>
            <dt>Selected Stages</dt>
            <dd>{selectedStages.length}</dd>
            <dt>Window Size</dt>
            <dd>{selectedStages.length}</dd>
            <dt>Busy</dt>
            <dd>{busy ? 'true' : 'false'}</dd>
          </dl>
        </aside>
      </section>

      <section>
        <HorizonLabTimeline tenantId={tenantId} windows={windows ?? []} selectedStages={selectedStages} />
      </section>

      <section className="lab-footer">
        <button type="button" onClick={refresh} disabled={busy}>
          Recompute now
        </button>
        <button
          type="button"
          onClick={() => {
            setRefreshMs(Math.max(250, refreshMs / 2));
          }}
          disabled={busy}
        >
          Faster updates
        </button>
      </section>
    </main>
  );
};
