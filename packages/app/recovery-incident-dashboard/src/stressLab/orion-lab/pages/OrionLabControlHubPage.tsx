import { useMemo } from 'react';
import { useOrionLabWorkspace } from '../hooks/useOrionLabWorkspace';
import { OrionLabConsole } from '../components/OrionLabConsole';
import { OrionSignalTimeline } from '../components/OrionSignalTimeline';
import { eventProfiles, routeUnionBuilder } from '@shared/type-level/stress-orion-template-math';
import { solveConstraintSeries, enforcePolicy } from '@shared/type-level/stress-orion-constraints';
import { constraintCatalog } from '@shared/type-level/stress-orion-constraints';
import { runFactories, instantiateAtScale } from '@shared/type-level/stress-orion-instantiator';
import type { HubCatalogByCommand } from '@shared/type-level-hub';
import { buildOrbiPayload, orbiCatalogSource } from '@shared/type-level/stress-orion-constellation';
import type { OrbiRoute } from '@shared/type-level/stress-orion-constellation';

const routeTemplates = [
  '/incident/compose/tag-001',
  '/workflow/simulate/tag-002',
  '/fabric/verify/tag-003',
] as const;

const runtimeBundle = {
  eventProfiles,
  routeCount: 12,
  routeUnion: routeUnionBuilder(),
  constraints: solveConstraintSeries(constraintCatalog),
  enforced: enforcePolicy('/incident/ingest/tag-x', {
    currentDomain: 'incident',
    verb: 'compose',
    active: true,
  }),
  factories: runFactories(),
  commandCatalog: {
    commands: routeTemplates,
    payload: instantiateAtScale('incident', routeTemplates),
  } as HubCatalogByCommand<typeof routeTemplates>,
  resolver: buildOrbiPayload(orbiCatalogSource),
  profileMap: {
    item: 12,
  },
} as const;

export const OrionLabControlHubPage = () => {
  const workspace = useOrionLabWorkspace();

  const profileStats = useMemo(() => {
    const sampleRoute = orbiCatalogSource[0] as OrbiRoute;
    return {
      eventSamples: runtimeBundle.eventProfiles.length,
      routeUnion: runtimeBundle.routeUnion,
      sampleRoute,
      constraintCount: runtimeBundle.constraints.length,
      factoryCount: runtimeBundle.factories.length,
      enforcedDomain: runtimeBundle.enforced.domain,
    };
  }, [workspace.state.config.workspace]);

  return (
    <main>
      <h1>Orion Control Hub</h1>
      <p>
        Resolver commands: {runtimeBundle.commandCatalog.commands.join(', ')}
      </p>
      <p>
        Event profiles: {profileStats.eventSamples} (union {profileStats.routeUnion})
      </p>
      <p>
        Sample route: {profileStats.sampleRoute} | Constraints {profileStats.constraintCount}
      </p>
      <p>
        Factories: {profileStats.factoryCount} | enforced: {profileStats.enforcedDomain}
      </p>
      <OrionSignalTimeline timeline={workspace.state.timeline} status={workspace.state.status} />
      <OrionLabConsole workspace={workspace} />
    </main>
  );
};
