import type { DiscriminatedRouteResolution, StressRouteToken } from '@shared/type-level/stress-conditional-discriminator-lattice';
import type { DistilledCatalog, DistilledRoute, CascadeRoute } from '@shared/type-level/stress-template-route-cascade';

interface TypeCompilerArenaSummaryProps {
  readonly selectedRoutes: readonly CascadeRoute[];
  readonly routeByToken: readonly DiscriminatedRouteResolution<StressRouteToken>[];
  readonly routeResolutions: DistilledCatalog<readonly CascadeRoute[]>;
  readonly branchLog: readonly { readonly state: string; readonly notes?: readonly string[]; readonly [key: string]: unknown }[];
  readonly solverSummary: {
    readonly total: number;
    readonly uniqueModes: readonly string[];
    readonly uniqueScopes: readonly string[];
    readonly sample: { readonly mode: string; readonly scope: string; readonly verb: string; readonly confidence: number; readonly trace: readonly string[] } | null;
  };
  readonly loading: boolean;
}

export const TypeCompilerArenaSummary = ({
  selectedRoutes,
  routeByToken,
  routeResolutions,
  branchLog,
  solverSummary,
  loading,
}: TypeCompilerArenaSummaryProps) => {
  const tokenRows = routeByToken.slice(0, 8);
  const resolved = routeResolutions as unknown as readonly DistilledRoute<CascadeRoute>[];
  const active = selectedRoutes;

  return (
    <section className="arena-summary" style={{ display: 'grid', gap: 12 }}>
      <article>
        <h3>Collections</h3>
        <p>{`selected=${active.length}`}</p>
        <p>{`tokens=${routeByToken.length}`}</p>
        <p>{`resolutions=${resolved.length}`}</p>
        <p>{`branches=${branchLog.length}`}</p>
        <p>{`solvers=${solverSummary.total}`}</p>
      </article>

      <article>
        <h3>Route Catalog Snapshot</h3>
        <ul>
          {selectedRoutes.slice(0, 8).map((entry) => {
            const label = resolved.find((resolution) => resolution.route === entry)?.label ?? '';
            return (
              <li key={entry}>
                {entry}
                <span>{loading ? ' pending' : label ? ` label=${label}` : ' pending'}</span>
              </li>
            );
          })}
        </ul>
      </article>

      <article>
        <h3>Solver Summary</h3>
        <p>{`modes=${solverSummary.uniqueModes.join(',') || 'none'}`}</p>
        <p>{`scopes=${solverSummary.uniqueScopes.join(',') || 'none'}`}</p>
        <p>{`sample=${
          solverSummary.sample === null
            ? 'none'
            : `${solverSummary.sample.mode}/${solverSummary.sample.scope}/${solverSummary.sample.verb}@${solverSummary.sample.confidence.toFixed(2)}`
        }`}</p>
      </article>

      <article>
        <h3>Branch State</h3>
        <ul>
          {branchLog.slice(0, 6).map((entry, index) => (
            <li key={`${entry.state}-${index}`}>{`${index} -> ${entry.state}`}</li>
          ))}
        </ul>
      </article>

      <article>
        <h3>Tokenized Distinct Keys</h3>
        <ul>
          {tokenRows.slice(0, 8).map((entry, index) => (
            <li key={`${entry.region}-${entry.action}-${index}`}>{`${entry.region}/${entry.action}=${entry.scope}`}</li>
          ))}
        </ul>
      </article>
    </section>
  );
};
