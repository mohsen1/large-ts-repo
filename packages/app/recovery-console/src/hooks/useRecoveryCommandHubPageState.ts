import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CommandArtifactEnvelope } from '@domain/recovery-operations-models/incident-command-artifacts';
import { InMemoryCommandHubStore } from '@data/recovery-operations-store/command-hub-repository';

interface CommandHubPageState {
  readonly selectedArtifactId?: string;
  readonly artifactTitles: readonly string[];
  readonly artifactMap: Readonly<Record<string, CommandArtifactEnvelope>>;
  readonly isLoaded: boolean;
}

export const useRecoveryCommandHubPageState = () => {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | undefined>(undefined);
  const [artifactTitles, setArtifactTitles] = useState<readonly string[]>([]);
  const [artifactMap, setArtifactMap] = useState<Readonly<Record<string, CommandArtifactEnvelope>>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  const query = useMemo(() => new InMemoryCommandHubStore(), []);

  const hydrate = useCallback(async () => {
    const artifacts = await query.queryArtifacts({ tenant: 'global' });
    if (!artifacts.ok) {
      setArtifactTitles([]);
      setArtifactMap({});
      setIsLoaded(false);
      return;
    }

    const map = artifacts.value.reduce<Record<string, CommandArtifactEnvelope>>((accumulator, artifact) => {
      accumulator[String(artifact.artifact.commandId)] = artifact;
      return accumulator;
    }, {});

    setArtifactMap(map);
    setArtifactTitles(Object.values(map).map((entry) => entry.artifact.title));
    setSelectedArtifactId((existing) => {
      if (!existing || !map[existing]) {
        return artifacts.value[0] ? String(artifacts.value[0].artifact.commandId) : undefined;
      }
      return existing;
    });
    setIsLoaded(true);
  }, [query]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const selectedArtifact = selectedArtifactId ? artifactMap[selectedArtifactId] : undefined;

  const commandIds = useMemo(() => Object.keys(artifactMap), [artifactMap]);

  return {
    state: {
      selectedArtifactId,
      artifactTitles,
      artifactMap,
      isLoaded,
    } as CommandHubPageState,
    setSelectedArtifactId,
    selectedArtifact,
    commandIds,
    hydrate,
  };
};
