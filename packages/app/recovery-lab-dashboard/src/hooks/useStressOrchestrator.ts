import { useEffect, useMemo, useState } from 'react';
import {
  routeCatalogFrom,
  baseCommandCatalog,
  bootstrapRoutes,
  hasOwner,
  domainByRoute,
  routeDomainMap,
} from '../services/stressRouteCatalog';
import type { EventRoute } from '@shared/type-level';

export interface StressOrchestratorViewModel {
  readonly owner: string;
  readonly domain: string;
  readonly routeCount: number;
  readonly selectedRoutes: readonly EventRoute[];
  readonly labels: readonly string[];
  readonly status: 'idle' | 'running' | 'ready' | 'error';
  readonly log: readonly string[];
}

const parseDomain = (route: EventRoute): string => {
  const [, domain] = route.split('/') as [string, string];
  return domain;
};

const normalizeOwner = (raw: string): string => {
  return raw.trim().toLowerCase();
};

const buildFallbackState = (): StressOrchestratorViewModel => ({
  owner: 'ops',
  domain: 'identity',
  routeCount: 0,
  selectedRoutes: [],
  labels: [],
  status: 'idle',
  log: [],
});

export const useStressOrchestrator = (owner: string, active = true): StressOrchestratorViewModel => {
  const [current, setCurrent] = useState<StressOrchestratorViewModel>(buildFallbackState);

  useEffect(() => {
    let mounted = true;
    const normalizedOwner = normalizeOwner(owner);

    const hydrate = async () => {
      setCurrent((previous) => ({
        ...previous,
        status: 'running',
      }));

      try {
        const byOwner = routeCatalogFrom(baseCommandCatalog);
        const routes: readonly EventRoute[] = (hasOwner(normalizedOwner) ? byOwner[normalizedOwner] : []) as readonly EventRoute[];
        const labels = routes.map(parseDomain);

        let routeCount = 0;
        let domain = current.domain;
        let status: StressOrchestratorViewModel['status'] = 'ready';
        const log = [] as string[];

        if (active) {
          routeCount = routes.length;
          if (routes.length === 0) {
            status = 'error';
            log.push(`owner=${normalizedOwner} has no routes`);
            for (const [ownerKey, routeSet] of Object.entries(byOwner)) {
              log.push(`${ownerKey}:${routeSet.length}`);
            }
          }

          for (const route of routes) {
            const domainFromRoute = domainByRoute(route);
            if (domainFromRoute) {
              domain = domainFromRoute;
            }
            if (domainFromRoute && !routeDomainMap[domainFromRoute]) {
              log.push(`unknown domain ${domainFromRoute}`);
            }
            if (route.includes('uuid')) {
              log.push(`uuid route ${route}`);
            }
          }
        } else {
          status = 'error';
          log.push('inactive orchestration disabled');
        }

        for (const action of ['create', 'activate', 'suspend', 'repair', 'drill']) {
          for (const [domainKey, available] of Object.entries(routeDomainMap)) {
            if (available.includes(action as never) && domain === domainKey) {
              log.push(`domain ${domain} supports ${action}`);
            }
          }
        }

        for (let index = 0; index < 16; index += 1) {
          if (index % 2 === 0) {
            log.push(`step-${index}`);
          }
          if (index === 8 && status === 'ready') {
            status = 'running';
          }
        }

        const payload = await bootstrapRoutes();
        if (Object.keys(payload).length === 0) {
          status = 'error';
          log.push('bootstrap empty map');
        }

        if (mounted) {
          setCurrent({
            owner: normalizedOwner,
            domain,
            routeCount,
            selectedRoutes: routes,
            labels,
            status,
            log,
          });
        }
      } catch {
        if (mounted) {
          setCurrent((previous) => ({
            ...previous,
            owner: normalizedOwner,
            status: 'error',
            log: [...previous.log, 'orchestrator crashed'],
          }));
        }
      }
    };

    void hydrate();

    return () => {
      mounted = false;
    };
  }, [owner, active]);

  const selected = useMemo(() => {
    const seen = new Set(current.selectedRoutes);
    return [...seen].slice(0, 20);
  }, [current.selectedRoutes]);

  return {
    ...current,
    selectedRoutes: selected,
  };
};
