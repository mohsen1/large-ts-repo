import type { ReactNode } from 'react';
import type { RouteFacet } from '@shared/type-level-hub';
import type { MeshMode } from '../types';

export type RouteDecision = `${MeshMode}.${'observe' | 'simulate' | 'plan' | 'operate' | 'review'}`;

const normalizeMode = (mode: MeshMode): RouteDecision => {
  switch (mode) {
    case 'observe':
      return 'observe.observe';
    case 'simulate':
      return 'simulate.simulate';
    case 'plan':
      return 'plan.plan';
    case 'operate':
      return 'operate.operate';
    case 'review':
      return 'review.review';
  }
};

export const routeDecision = (pathname: string, mode: MeshMode): RouteDecision => {
  if (pathname.includes('simulate')) {
    return 'simulate.simulate';
  }
  if (pathname.includes('plan')) {
    return 'plan.plan';
  }
  if (pathname.includes('operate')) {
    return 'operate.operate';
  }
  if (pathname.includes('review')) {
    return 'review.review';
  }
  if (pathname.includes('observe')) {
    return 'observe.observe';
  }
  return normalizeMode(mode);
};

const Segment = ({ children, active }: { readonly children: ReactNode; readonly active: boolean }) => (
  <span className={`mesh-segment ${active ? 'mesh-segment--active' : ''}`}>{children}</span>
);

export const TypeMeshTopologyStrip = ({
  routes,
  activeMode,
  selected,
}: {
  readonly routes: readonly RouteFacet[];
  readonly activeMode: MeshMode;
  readonly selected: RouteDecision;
}) => {
  return (
    <ul className="mesh-topology-strip">
      {routes.map((route) => {
        const [, domain, action, resource] = route.split('/') as [string, string, string, string];
        const isActive = selected.startsWith(activeMode);

        return (
          <li key={route}>
            <Segment active={isActive}>
              <strong>{domain.toUpperCase()}</strong> / {action} / {resource}
            </Segment>
          </li>
        );
      })}
    </ul>
  );
};
