export type NoInfer<T> = [T][T extends any ? 0 : never];

type PortIdentity = {
  readonly portId: string;
  readonly environment: 'atlas' | 'mesh' | 'fleet';
  readonly version: 1;
};

type PortMetadata = {
  readonly label: string;
  readonly activeAt: number;
  readonly tags: readonly string[];
};

type PortTelemetry = {
  readonly healthy: boolean;
  readonly latencyMs: number;
  readonly queueDepth: number;
};

export type EnvelopePort<TIdentity extends PortIdentity, TMetadata extends PortMetadata, TTelemetry extends PortTelemetry> =
  Omit<TIdentity, keyof TMetadata | keyof TTelemetry>
  & Omit<TMetadata, keyof TIdentity | keyof TTelemetry>
  & Omit<TTelemetry, keyof TIdentity | keyof TMetadata>;

export type DisjointPortEnvelope<
  TIdentity extends PortIdentity,
  TMetadata extends PortMetadata,
  TTelemetry extends PortTelemetry,
> = EnvelopePort<TIdentity, TMetadata, TTelemetry> & {
  readonly merged: true;
};

export type PortProfile<
  TIdentity extends PortIdentity,
  TMetadata extends PortMetadata,
  TTelemetry extends PortTelemetry,
> =
  & TIdentity
  & Omit<TMetadata, keyof TIdentity>
  & Omit<TTelemetry, keyof TIdentity | keyof TMetadata>;

export type PortInputMap<T extends Record<string, PortIdentity>> = {
  [K in keyof T]: {
    readonly identity: T[K];
    readonly key: K;
  }
};

export type PortMetadataMap<T extends Record<string, PortMetadata>> = {
  [K in keyof T]: {
    readonly metadata: T[K];
    readonly key: K;
  }
};

export type PortTelemetryMap<T extends Record<string, PortTelemetry>> = {
  [K in keyof T]: {
    readonly telemetry: T[K];
    readonly key: K;
  }
};

export const materializeEnvelope = <
  const TIdentity extends PortIdentity,
  const TMetadata extends PortMetadata,
  const TTelemetry extends PortTelemetry,
>(
  identity: NoInfer<TIdentity>,
  metadata: NoInfer<TMetadata>,
  telemetry: NoInfer<TTelemetry>,
): PortProfile<TIdentity, TMetadata, TTelemetry> => {
  return {
    ...(identity as object),
    ...(metadata as object),
    ...(telemetry as object),
  } as PortProfile<TIdentity, TMetadata, TTelemetry>;
};

export type RemapIdentityKeys<T extends Record<string, string>> = {
  [K in keyof T as `identity_${K & string}`]: { readonly source: K; readonly value: T[K] };
};

export type RemapMetadataKeys<T extends Record<string, unknown>> = {
  [K in keyof T as `metadata_${K & string}`]: T[K];
};

export type RemapTelemetryKeys<T extends Record<string, unknown>> = {
  [K in keyof T as `telemetry_${K & string}`]: T[K];
};

export const mergePortShapes = <
  const TIdentity extends Record<string, PortIdentity>,
  const TMetadata extends Record<string, PortMetadata>,
  const TTelemetry extends Record<string, PortTelemetry>,
>(
  identities: TIdentity,
  metadata: TMetadata,
  telemetry: TTelemetry,
) => {
  const identityKeys = Object.keys(identities);
  const identityEntries = identityKeys.flatMap((key) => {
    const identity = identities[key as keyof TIdentity];
    const meta = metadata[key as keyof TMetadata];
    const tel = telemetry[key as keyof TTelemetry];
    return {
      key,
      identity,
      metadata: meta,
      telemetry: tel,
    };
  });

  return {
    identities,
    metadata,
    telemetry,
    envelopeCount: identityKeys.length,
    envelopes: identityEntries,
  } satisfies {
    readonly identities: TIdentity;
    readonly metadata: TMetadata;
    readonly telemetry: TTelemetry;
    readonly envelopeCount: number;
    readonly envelopes: Array<{
      key: string;
      identity: PortIdentity;
      metadata: PortMetadata;
      telemetry: PortTelemetry;
    }>;
  };
};

export const buildPortCollection = (
  rootPorts: readonly {
    id: string;
    label: string;
    zone: string;
    healthy: boolean;
    queueDepth: number;
    activeAt: number;
    tags: readonly string[];
  }[],
): readonly DisjointPortEnvelope<PortIdentity, PortMetadata, PortTelemetry>[] => {
  return rootPorts.map((port) => {
    const identity: PortIdentity = {
      portId: port.id,
      environment: 'atlas',
      version: 1,
    };
    const metadata: PortMetadata = {
      label: `${port.label}@${port.zone}`,
      activeAt: port.activeAt,
      tags: port.tags,
    };
    const telemetry: PortTelemetry = {
      healthy: port.healthy,
      latencyMs: port.queueDepth * 11,
      queueDepth: port.queueDepth,
    };
    return {
      ...identity,
      ...metadata,
      ...telemetry,
      merged: true,
    };
  });
};

export type RoutedEnvelopePayload<T extends readonly DisjointPortEnvelope<PortIdentity, PortMetadata, PortTelemetry>[]> = {
  readonly payload: T;
  readonly map: ReadonlyMap<string, PortTelemetry & { readonly portId: string }>;
};

export const mapPortTelemetry = <
  const T extends readonly DisjointPortEnvelope<PortIdentity, PortMetadata, PortTelemetry>[],
>(
  input: NoInfer<T>,
) => {
  const rows = input.map((entry) => ({
    portId: entry.portId,
    telemetry: {
      healthy: entry.healthy,
      latencyMs: entry.latencyMs,
      queueDepth: entry.queueDepth,
    },
  }));

  return {
    payload: input,
    map: new Map(rows.map((row) => [row.portId, { ...row.telemetry, portId: row.portId }])),
  } satisfies RoutedEnvelopePayload<T>;
};
