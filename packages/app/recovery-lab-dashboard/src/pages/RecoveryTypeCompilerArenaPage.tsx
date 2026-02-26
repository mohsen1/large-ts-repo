import { TypeCompilerArenaControls } from '../components/type-stress-arena/TypeCompilerArenaControls';
import { TypeCompilerArenaSummary } from '../components/type-stress-arena/TypeCompilerArenaSummary';
import { useTypeLevelCompilerArena } from '../hooks/useTypeLevelCompilerArena';

const branchLogToSummary = (branchLog: ReturnType<typeof useTypeLevelCompilerArena>['branchLog']) =>
  branchLog.map((entry) => ({
    state: entry.state,
    notes: 'notes' in entry ? (entry.notes as readonly string[]) : [],
  }));

export const RecoveryTypeCompilerArenaPage = () => {
  const arena = useTypeLevelCompilerArena({ initialScope: 'all', initialPage: 'routes' });

  return (
    <main style={{ padding: 16, display: 'grid', gap: 16 }}>
      <TypeCompilerArenaControls
        scope={arena.scope}
        page={arena.page}
        loading={arena.loading}
        matrixSize={arena.matrixSize}
        onScopeChange={arena.actions.setScope}
        onPageChange={arena.actions.setPage}
        runRoutes={arena.actions.runRouteResolution}
        runBranches={arena.actions.runBranchPass}
        runSolvers={arena.actions.runSolverPass}
        resetAll={arena.actions.resetAll}
      />

      <TypeCompilerArenaSummary
        selectedRoutes={arena.selectedRoutes}
        routeByToken={arena.routeByToken}
        routeResolutions={arena.routeResolutions}
        branchLog={branchLogToSummary(arena.branchLog)}
        solverSummary={{
          total: arena.solverSummary.total,
          uniqueModes: arena.solverSummary.uniqueModes as readonly string[],
          uniqueScopes: arena.solverSummary.uniqueScopes as readonly string[],
          sample: arena.solverSummary.sample
            ? {
                mode: arena.solverSummary.sample.mode,
                scope: arena.solverSummary.sample.scope,
                verb: arena.solverSummary.sample.verb,
                confidence: arena.solverSummary.sample.confidence,
                trace: arena.solverSummary.sample.trace,
              }
            : null,
        }}
        loading={arena.loading}
      />

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <article>
          <h3>Route Chain</h3>
          <ul>
            {arena.routeCascade.slice(0, 12).map((entry, index) => (
              <li key={`${entry.token}-${index}`}>{`${entry.token} [${entry.scopeWeight}]`}</li>
            ))}
          </ul>
        </article>
        <article>
          <h3>Active Page</h3>
          <p>{arena.page}</p>
          <p>{arena.taggedSample ? 'Sample branded result present' : 'No branded sample'}</p>
          <p>{`routes selected: ${arena.selectedRoutes.length}`}</p>
          <p>{`branch state: ${arena.branchState}`}</p>
        </article>
      </section>
    </main>
  );
};

