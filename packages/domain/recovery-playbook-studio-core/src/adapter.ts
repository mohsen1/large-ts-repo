import type { NoInfer } from '@shared/type-level';
import type {
  PluginByKind,
  PluginDefinitionBag,
  PluginKind,
  PluginOutput,
  StudioArtifact,
  StudioPluginDefinition,
} from '@shared/playbook-studio-runtime';
import {
  type PlaybookRun,
  type RecordByArtifact,
} from './models';
import type { ArtifactId } from '@shared/playbook-studio-runtime';

type ArtifactPayload<TRecord extends string> = {
  readonly artifactId: TRecord;
  readonly runId: string;
  readonly requestedBy: string;
};

export type StageOutput<TPayload extends ArtifactPayload<string>> = {
  readonly artifactId: TPayload['artifactId'];
  readonly runId: TPayload['runId'];
  readonly accepted: boolean;
};

export interface AdapterContext {
  readonly now: string;
  readonly requestId: string;
}

export interface StudioAdapter<TDefs extends PluginDefinitionBag, TInput extends ArtifactPayload<string>> {
  readonly pluginDefinitions: TDefs;
  readonly adapters: {
    readonly toPayload: (artifact: StudioArtifact, run: PlaybookRun) => TInput;
    readonly toDiagnostics: (output: StageOutput<TInput>, run: PlaybookRun) => StageOutput<TInput>;
  };
}

export type AdapterByKind<TDefs extends PluginDefinitionBag> = PluginByKind<TDefs, 'planner'>;

export type PluginEnvelope<TDef extends StudioPluginDefinition<PluginKind, unknown, unknown>> = {
  readonly definition: TDef;
  readonly name: TDef['id'];
};

export interface AdapterRuntime<TDefs extends PluginDefinitionBag> {
  readonly definitions: TDefs;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly initialize: (definitions: TDefs, context: AdapterContext) => void;
  readonly snapshot: (runId: string) => Promise<{
    readonly runId: string;
    readonly outputs: Readonly<
      Record<
        keyof TDefs & string,
        PluginOutput<TDefs[keyof TDefs & string]>
      >
    >;
  }>;
}

export type AdaptedDiagnostics<TDefs extends PluginDefinitionBag> = {
  readonly runMap: {
    [K in keyof TDefs]: {
      readonly pluginId: K;
      readonly output: PluginOutput<TDefs[K]>;
    };
  };
};

export const createArtifactRecord = <
  const TArtifactIds extends readonly ArtifactId[],
>(
  artifactIds: TArtifactIds,
): RecordByArtifact<TArtifactIds> => {
  return artifactIds.reduce((acc, artifactId) => {
    acc[artifactId as TArtifactIds[number]] = {
      artifactId,
      active: true,
      runCount: 0,
    };
    return acc;
  }, {} as RecordByArtifact<TArtifactIds>);
};

export const normalizeAdapterContext = <T extends AdapterContext>(ctx: T): T & {
  readonly now: string;
} => ({
  ...ctx,
  now: ctx.now || new Date().toISOString(),
});

export const applyAdapter = <
  const TDefs extends PluginDefinitionBag,
  const TInput extends ArtifactPayload<string>,
>(
  plugin: PluginByKind<TDefs, 'executor'>,
  input: NoInfer<TInput>,
): NoInfer<TInput> => {
  void plugin;
  return input;
};
