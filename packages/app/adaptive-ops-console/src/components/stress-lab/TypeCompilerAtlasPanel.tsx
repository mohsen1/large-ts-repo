import { useMemo } from 'react';
import {
  atlasBundle,
  atlasDecisionLog,
  atlasPayload,
  atlasProfiles,
  atlasRuntimeState,
  type AtlasDecisionProfile,
} from '@domain/recovery-lab-synthetic-orchestration';

type AtlasEnvelope = (typeof atlasProfiles)[number];

const formatRoute = (route: string, index: number): string => `${index + 1}. ${route}`;

export const TypeCompilerAtlasPanel = () => {
  const routeSignals = useMemo(() => {
    const values = atlasRuntimeState.signals?.slice(0, 4) ?? [];
    return values.map((item, index) => `${formatRoute(item.route, index)} · ${item.routeSignal}`);
  }, []);

  const profileByDomain = useMemo(() => {
    const matrix = new Map<string, number>();
    for (const profile of atlasProfiles) {
      matrix.set(profile.domain, profile.routeCount);
    }
    return [...matrix.entries()].map(([domain, routeCount]) => ({ domain, routeCount }));
  }, []);

  const bundleProfile = useMemo(() => {
    const templateCount = atlasPayload.signatures.length;
    const routeCount = atlasPayload.routeCount;
    const tupleLength = atlasBundle.tuples.length;
    return {
      templateCount,
      routeCount,
      tupleLength,
      active: atlasBundle.modeNodes?.length ?? 0,
    };
  }, []);

  const decisions = useMemo(() => {
    return atlasDecisionLog.map<AtlasDecisionProfile>((record) => ({
      route: record.profile.template,
      byEntity: record.profile.byEntity,
      templates: record.profile.templates,
    }));
  }, []);

  return (
    <section className="type-compiler-atlas-panel">
      <header>
        <h3>Atlas Compiler Atlas</h3>
        <p>
          routes={atlasPayload.routeCount} · templates={bundleProfile.templateCount} · tuples={bundleProfile.tupleLength} ·
          active={bundleProfile.active}
        </p>
      </header>
      <div>
        <h4>Signals</h4>
        <ul>
          {routeSignals.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4>Domain Distribution</h4>
        <ul>
          {profileByDomain.map((entry) => (
            <li key={entry.domain}>
              {entry.domain}: {entry.routeCount}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4>Decisions</h4>
        <ul>
          {decisions.map((entry) => (
            <li key={entry.byEntity}>{entry.byEntity}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};

