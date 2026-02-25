import { type ReactElement } from 'react';
import { type ChronicleRouteOption } from '../../types';

export interface ChronicleGraphToolbarProps {
  readonly routes: readonly ChronicleRouteOption[];
  readonly activeRoute: string;
  readonly onRouteChange: (route: string) => void;
  readonly onClearWarnings: () => void;
}

export const ChronicleGraphToolbar = ({
  routes,
  activeRoute,
  onRouteChange,
  onClearWarnings,
}: ChronicleGraphToolbarProps): ReactElement => {
  return (
    <section>
      <h3>Routes</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {routes.map((routeOption) => (
          <button
            key={`${routeOption.tenant}:${routeOption.route}`}
            type="button"
            style={{ background: routeOption.route === activeRoute ? '#2f2' : '#ddd' }}
            onClick={() => onRouteChange(routeOption.route)}
          >
            {routeOption.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={onClearWarnings}>
        Clear warnings
      </button>
    </section>
  );
};
