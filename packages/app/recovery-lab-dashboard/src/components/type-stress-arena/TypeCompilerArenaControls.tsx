import type { ChangeEvent } from 'react';

type ArenaScope = 'all' | 'ops' | 'incident' | 'fabric' | 'policy';
type ArenaPage = 'routes' | 'branches' | 'solvers';

interface TypeCompilerArenaControlsProps {
  readonly scope: ArenaScope;
  readonly page: ArenaPage;
  readonly loading: boolean;
  readonly matrixSize: number;
  readonly onScopeChange: (next: ArenaScope) => void;
  readonly onPageChange: (next: ArenaPage) => void;
  readonly runRoutes: () => Promise<void>;
  readonly runBranches: () => Promise<void>;
  readonly runSolvers: () => Promise<void>;
  readonly resetAll: () => void;
}

export const TypeCompilerArenaControls = ({
  scope,
  page,
  loading,
  matrixSize,
  onScopeChange,
  onPageChange,
  runRoutes,
  runBranches,
  runSolvers,
  resetAll,
}: TypeCompilerArenaControlsProps) => {
  const scopeOptions: ArenaScope[] = ['all', 'ops', 'incident', 'fabric', 'policy'];
  const pageOptions: ArenaPage[] = ['routes', 'branches', 'solvers'];

  return (
    <section className="arena-controls" style={{ display: 'grid', gap: 8 }}>
      <header>
        <h2>Type Compiler Arena</h2>
        <p>{`matrix-size=${matrixSize}`}</p>
      </header>

      <label>
        Scope
        <select value={scope} onChange={(event: ChangeEvent<HTMLSelectElement>) => onScopeChange(event.target.value as ArenaScope)}>
          {scopeOptions.map((entry) => (
            <option value={entry} key={entry}>
              {entry}
            </option>
          ))}
        </select>
      </label>

      <label>
        Page
        <select value={page} onChange={(event: ChangeEvent<HTMLSelectElement>) => onPageChange(event.target.value as ArenaPage)}>
          {pageOptions.map((entry) => (
            <option value={entry} key={entry}>
              {entry}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={loading} onClick={runRoutes}>
          evaluate routes
        </button>
        <button type="button" disabled={loading} onClick={runBranches}>
          run branch graph
        </button>
        <button type="button" disabled={loading} onClick={runSolvers}>
          run solvers
        </button>
        <button type="button" onClick={resetAll}>
          reset
        </button>
      </div>
    </section>
  );
};

