export interface CommandManifest {
  readonly namespace: string;
  readonly version: string;
  readonly description: string;
  readonly partitions: number;
  readonly tags: readonly string[];
  readonly channels: readonly {
    readonly id: string;
    readonly name: string;
    readonly weight: number;
    readonly required: boolean;
  }[];
}

export const commandManifestSeed: CommandManifest = {
  namespace: 'command-graph-kernel',
  version: '1.0.0',
  description: 'bootstrap command graph kernel manifest',
  partitions: 3,
  tags: ['graph', 'orchestration', 'telemetry'],
  channels: [
    { id: 'ingest', name: 'Input ingest', weight: 13, required: true },
    { id: 'transform', name: 'Transform', weight: 37, required: true },
    { id: 'dispatch', name: 'Dispatch', weight: 31, required: false },
  ],
};

export const getManifest = (): CommandManifest => ({ ...commandManifestSeed });
export const manifestChannelIds = (manifest: CommandManifest): readonly string[] =>
  manifest.channels.map((entry) => entry.id);

export const estimateLoad = (manifest: CommandManifest): number =>
  manifest.channels.reduce((total, channel) => total + channel.weight, 0);

export const manifestSatisfies = (manifest: CommandManifest): manifest is CommandManifest => {
  return manifest.partitions > 0 && manifest.channels.length > 0;
};
