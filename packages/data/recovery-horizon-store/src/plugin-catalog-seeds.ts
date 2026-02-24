import { withBrand } from '@shared/core';
import { pluginKinds, buildPluginId } from '@domain/recovery-incident-lab-core';
import type { PluginManifestId, PluginKind } from '@domain/recovery-incident-lab-core';

type SeedRecord = {
  readonly id: PluginManifestId;
  readonly kind: PluginKind;
  readonly namespace: string;
  readonly title: string;
};

const seedData = async (): Promise<readonly SeedRecord[]> => {
  const now = new Date().toISOString();
  return pluginKinds.flatMap((kind: PluginKind) =>
    [
      {
        id: buildPluginId(`${kind}-core`, kind),
        kind,
        namespace: `incident-lab:${kind}:core`,
        title: `${kind} baseline plugin`,
      },
      {
        id: withBrand(`${kind}:simulation:${now}`, 'PluginManifestId'),
        kind,
        namespace: `incident-lab:${kind}:sim`,
        title: `${kind} simulation plugin`,
      },
    ],
  );
};

export const pluginCatalogSeeds = await seedData();
