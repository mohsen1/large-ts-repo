import type {
  PluginStage,
  PluginConfig,
  PluginContract,
  JsonLike,
  TimeMs,
  StageLabel,
  PluginSignalLike,
  HorizonSignal,
} from '@domain/recovery-horizon-engine';
import { horizonBrand } from '@domain/recovery-horizon-engine';

export interface AdapterDescriptor {
  readonly pluginKind: PluginStage;
  readonly region: string;
  readonly priority: number;
}

export interface AdapterRuntime {
  readonly adapter: {
    readonly id: string;
    readonly supportedStages: readonly PluginStage[];
    normalize: (input: PluginConfig<PluginStage, JsonLike>) => {
      readonly span: {
        readonly stage: PluginStage;
        readonly label: StageLabel<PluginStage>;
        readonly startedAt: TimeMs;
      };
    } & PluginConfig<PluginStage, JsonLike>;
    execute: (input: readonly PluginConfig<PluginStage, JsonLike>[], signal: AbortSignal) => Promise<HorizonSignal<PluginStage, JsonLike>[]>;
    toDiagnostic: (config: PluginConfig<PluginStage, JsonLike>) => string;
  };
  readonly region: string;
  readonly capacity: number;
  readonly latency: TimeMs;
}

const asRecord = (value: JsonLike): Record<string, JsonLike> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, JsonLike>;
  }
  return {};
};

const toTenantId = (value: JsonLike): string => {
  const values = asRecord(value);
  const candidate = values.tenantId;
  return typeof candidate === 'string' ? candidate : 'tenant-001';
};

const toRunId = (value: JsonLike): string => {
  const values = asRecord(value);
  const candidate = values.runId;
  return typeof candidate === 'string' ? candidate : `run-${Date.now()}`;
};

export const createSignalAdapter = <TKind extends PluginStage>(
  kind: TKind,
  region = 'global',
): AdapterRuntime['adapter'] => {
  const label = `${kind.toUpperCase()}_STAGE` as StageLabel<TKind>;

  return {
    id: `adapter-${kind}-${region}`,
    supportedStages: [kind] as readonly TKind[],
    normalize(input) {
      return {
        ...input,
        span: {
          stage: kind,
          label,
          startedAt: 0 as TimeMs,
        },
      };
    },
    async execute(input, signal) {
      const outputs: HorizonSignal<PluginStage, JsonLike>[] = input.map((entry, index) => {
        const metadata = asRecord(entry.payload);
        const tenantId = toTenantId(metadata);
        const payload = {
          id: horizonBrand.fromPlanId(`${tenantId}-${kind}-${index}`),
          kind,
          payload: entry.payload,
          input: {
            version: '1.0.0',
            runId: horizonBrand.fromRunId(toRunId(metadata)),
            tenantId,
            stage: kind,
            tags: [kind, region, 'plugin-adapter'],
            metadata,
          },
          severity: 'low',
          startedAt: horizonBrand.fromDate(new Date().toISOString()),
        };
        const signal = payload as HorizonSignal<PluginStage, JsonLike> & { expiresAt?: TimeMs };

        const rawExpiresAt = metadata.expiresAt;
        if (typeof rawExpiresAt === 'number') {
          signal.expiresAt = horizonBrand.fromTime(rawExpiresAt);
        }

        return signal;
      });

      return outputs as PluginSignalLike[];
    },
    toDiagnostic(config) {
      return `${kind}::${region}::${config.pluginKind}`;
    },
  };
};

export interface ContractEnvelope {
  readonly contract: PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>;
  readonly adapter: AdapterRuntime['adapter'];
}

export const composeAdapters = (
  contracts: readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
): readonly ContractEnvelope[] => {
  return contracts.map((contract) => ({
    contract,
    adapter: createSignalAdapter(contract.kind, contract.capabilities[0]?.key ?? 'global'),
  }));
};

export const buildAdapterMatrix = (
  descriptors: readonly AdapterDescriptor[],
): Map<string, readonly AdapterRuntime[]> => {
  const matrix = new Map<string, readonly AdapterRuntime[]>();
  for (const descriptor of descriptors) {
    const adapter = createSignalAdapter(descriptor.pluginKind, descriptor.region);
    const runtime: AdapterRuntime = {
      adapter,
      region: descriptor.region,
      capacity: Math.max(1, descriptor.priority),
      latency: (descriptor.priority * 13) as TimeMs,
    };

    const existing = matrix.get(descriptor.pluginKind) ?? [];
    matrix.set(descriptor.pluginKind, [...existing, runtime]);
  }

  return matrix;
};
