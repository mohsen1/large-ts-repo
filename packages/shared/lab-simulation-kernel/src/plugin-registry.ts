import type { NoInfer } from '@shared/type-level';
import type { PluginName, PlanToken, RunToken, TenantId, StageName } from './ids';

export type PluginStage = StageName;

export interface PluginSpec<TName extends string = string, TStage extends PluginStage = PluginStage, TVersion extends string = string> {
  readonly name: PluginName | TName;
  readonly stage: TStage;
  readonly version: TVersion;
  readonly weight: number;
}

export type PluginContract<
  TName extends string = string,
  TInput = unknown,
  TOutput = unknown,
  TStage extends PluginStage = PluginStage,
> = {
  readonly spec: PluginSpec<TName, TStage>;
  readonly name: PluginName | TName;
  readonly stage: TStage;
  run(input: PluginExecutionInput<TInput>): Promise<PluginExecutionOutput<TOutput>>;
};

export type PluginCatalog = readonly PluginContract[];

export type PluginExecutionInput<TPayload = unknown> = {
  readonly tenant: TenantId;
  readonly planId: PlanToken;
  readonly runId: RunToken;
  readonly stage: PluginStage;
  readonly payload: TPayload;
  readonly context: Readonly<Record<string, unknown>>;
};

export interface PluginExecutionOutput<TPayload = unknown> {
  readonly plugin: string;
  readonly stage: PluginStage;
  readonly durationMs: number;
  readonly payload: TPayload;
  readonly warnings: readonly string[];
}

export interface PluginTrace {
  readonly plugin: string;
  readonly stage: PluginStage;
  readonly startedAt: Date;
  readonly ms: number;
  readonly ok: boolean;
}

export type CatalogByStage<TCatalog extends PluginCatalog> = {
  [K in PluginStage]: Extract<TCatalog[number], { stage: K }>[];
};

export type StageMap = {
  [K in PluginStage]: readonly string[];
};

export interface StageCatalogSummary<TCatalog extends PluginCatalog> {
  readonly catalog: TCatalog;
  readonly buckets: StageMap;
  readonly totals: {
    readonly [K in PluginStage]: number;
  };
}

export type PluginScope<TCatalog extends PluginCatalog> = {
  readonly catalog: TCatalog;
  readonly buckets: CatalogByStage<TCatalog>;
};

const makePluginBuckets = <TCatalog extends PluginCatalog>(): CatalogByStage<TCatalog> => {
  return ({
    detect: [],
    disrupt: [],
    verify: [],
    restore: [],
  }) as unknown as CatalogByStage<TCatalog>;
};

const makeStageBuckets = <TCatalog extends PluginCatalog>(): StageMap =>
  ({
    detect: [],
    disrupt: [],
    verify: [],
    restore: [],
  }) as StageMap;

export class Registry<TCatalog extends PluginCatalog> {
  readonly #catalog: TCatalog;
  readonly #active = new Map<string, TCatalog[number]>();

  public constructor(catalog: TCatalog) {
    this.#catalog = catalog;
    for (const entry of catalog) {
      this.#active.set(entry.name as string, entry);
    }
  }

  public static create<TCatalog extends PluginCatalog>(catalog: TCatalog): Registry<TCatalog> {
    return new Registry(catalog);
  }

  public list(): readonly TCatalog[number][] {
    return [...this.#active.values()];
  }

  public scope(): PluginScope<TCatalog> {
    const buckets = makePluginBuckets<TCatalog>() as Record<PluginStage, PluginContract[]>;
    for (const plugin of this.list()) {
      const stage = plugin.stage;
      switch (stage) {
        case 'detect':
          buckets.detect.push(plugin as PluginContract);
          break;
        case 'disrupt':
          buckets.disrupt.push(plugin as PluginContract);
          break;
        case 'verify':
          buckets.verify.push(plugin as PluginContract);
          break;
        case 'restore':
          buckets.restore.push(plugin as PluginContract);
          break;
        default:
          break;
      }
    }
    return { catalog: this.#catalog, buckets: buckets as unknown as PluginScope<TCatalog>['buckets'] };
  }

  public byStage<TStage extends PluginStage>(
    stage: NoInfer<TStage>,
  ): readonly Extract<TCatalog[number], { stage: TStage }>[] {
    return this.scope().buckets[stage] as unknown as readonly Extract<TCatalog[number], { stage: TStage }>[];
  }

  public async execute<TInput, TOutput>(
    stage: NoInfer<PluginStage>,
    input: PluginExecutionInput<TInput>,
    sink?: (trace: PluginTrace, payload: PluginExecutionOutput<TOutput>) => void,
  ): Promise<PluginExecutionOutput<TOutput>[]> {
    const output: PluginExecutionOutput<TOutput>[] = [];
    for (const plugin of this.byStage(stage)) {
      const started = performance.now();
      const result = (await plugin.run(input)) as PluginExecutionOutput<TOutput>;
      const wrapped = {
        ...result,
        durationMs: Math.max(0, performance.now() - started),
      };
      sink?.(
        {
          plugin: plugin.name as string,
          stage: stage as PluginStage,
          startedAt: new Date(),
          ms: wrapped.durationMs,
          ok: true,
        },
        wrapped,
      );
      output.push(wrapped);
    }
    return output;
  }
}

export const createCatalog = <T extends PluginCatalog>(catalog: T): T => catalog;

export const createCatalogSummary = <T extends PluginCatalog>(catalog: T): StageCatalogSummary<T> => {
  const buckets = makeStageBuckets<T>();
  let detect = 0;
  let disrupt = 0;
  let verify = 0;
  let restore = 0;

  for (const plugin of catalog) {
    const stage = plugin.stage;
    buckets[stage] = [...buckets[stage], plugin.name as string];
    switch (stage) {
      case 'detect':
        detect += 1;
        break;
      case 'disrupt':
        disrupt += 1;
        break;
      case 'verify':
        verify += 1;
        break;
      case 'restore':
        restore += 1;
        break;
      default:
        break;
    }
  }

  return {
    catalog,
    buckets,
    totals: {
      detect,
      disrupt,
      verify,
      restore,
    },
  };
};

export const summarizePlugins = <T extends PluginCatalog>(catalog: T): StageMap => {
  return createCatalogSummary(catalog).buckets;
};

export interface StageWindow {
  readonly from: number;
  readonly to: number;
  readonly samples: readonly number[];
}

export const makeWindow = (...args: readonly [from: number, to: number, sample: number | readonly number[]]): StageWindow => {
  const sampleValues = Array.isArray(args[2]) ? args[2] : [args[2]];
  return {
    from: args[0],
    to: args[1],
    samples: sampleValues,
  };
};
