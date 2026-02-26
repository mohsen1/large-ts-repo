import { z } from 'zod';
import type { JsonLike, PluginStage } from '@domain/recovery-horizon-engine';
import { type Branded, tokenizeTemplate, type TokenizedTemplate, toTokenizedTemplate } from '@shared/type-level';
import { stageSchema } from './observability-identity';

export type PayloadSchemaId = Branded<string, 'PayloadSchemaId'>;
export type PayloadRoute<T extends string = string> = `${Lowercase<T>}/schema`;
export type PayloadTuple = readonly [string, string, JsonLike];

export const payloadRoutes = ['raw', 'normalized', 'insight', 'audit'] as const;
export type PayloadRouteKind = (typeof payloadRoutes)[number];
export type StageProfile<TStage extends PluginStage> = {
  readonly stage: TStage;
  readonly route: PayloadRouteKind;
  readonly value: JsonLike;
};

export type PayloadByRoute<T extends readonly StageProfile<PluginStage>[]> = {
  [K in T[number] as K['route']]: K['value'];
};

export type PayloadMapper<TInput extends readonly PayloadTuple[]> = TInput extends readonly [
  infer H,
  ...infer Tail
]
  ? H extends PayloadTuple
    ? [PayloadToObject<H>, ...PayloadMapper<Tail & readonly PayloadTuple[]>]
    : PayloadMapper<Tail & readonly PayloadTuple[]>
  : [];

export type PayloadToObject<T extends PayloadTuple> = {
  readonly route: T[0];
  readonly key: T[1];
  readonly value: T[2];
};

const payloadRouteSchema = z.enum(payloadRoutes);

export const payloadSchema = z.object({
  route: payloadRouteSchema,
  tenant: z.string().min(1),
  payload: z.record(z.unknown()),
  stage: stageSchema,
  schemaId: z.string().min(4),
});

export type ParsedPayload = z.infer<typeof payloadSchema>;

export interface PayloadArtifact<
  TRoute extends PayloadRouteKind,
  TValue extends JsonLike = JsonLike,
> {
  readonly route: TRoute;
  readonly schemaId: PayloadSchemaId;
  readonly tokens: TokenizedTemplate<TRoute>;
  readonly payload: TValue;
}

const parseRoute = (value: unknown): ParsedPayload => payloadSchema.parse(value);

const toPayloadSchemaId = (tenant: string, route: PayloadRouteKind): PayloadSchemaId =>
  (`${tenant}:${route}` as PayloadSchemaId);

export const normalizePayloadInput = <const T extends ParsedPayload[]>(raw: T) => {
  return raw.filter((entry): entry is T[number] => entry.payload !== null);
};

export const groupPayloadByRoute = <TProfiles extends readonly ParsedPayload[]>(
  profiles: TProfiles,
): Record<PayloadRouteKind, PayloadArtifact<PayloadRouteKind, JsonLike>[]> => {
  const empty: Record<PayloadRouteKind, PayloadArtifact<PayloadRouteKind, JsonLike>[]> = {
    raw: [],
    normalized: [],
    insight: [],
    audit: [],
  };

  for (const profile of profiles) {
    const route = profile.route as PayloadRouteKind;
    const tokens = toTokenizedTemplate(profile.route) as TokenizedTemplate<PayloadRouteKind>;
    const schemaId = toPayloadSchemaId(profile.tenant, route);
    const artifact: PayloadArtifact<PayloadRouteKind, JsonLike> = {
      route,
      schemaId,
      tokens,
      payload: profile.payload as JsonLike,
    };
    empty[route].push(artifact);
  }

  return empty;
};

export const buildPayloadTemplate = <
  TInput extends string,
> (input: TInput): PayloadRoute<TInput> => {
  const tokens = tokenizeTemplate(input as string);
  return `${tokens.join('/')}/schema` as PayloadRoute<TInput>;
};

export const parsePayloadEnvelope = (input: unknown): ParsedPayload => {
  return parseRoute(input);
};

export const toArtifactByTuple = <const T extends readonly PayloadTuple[]>(
  payloads: T,
): Readonly<PayloadMapper<T>> => {
  const out: PayloadToObject<PayloadTuple>[] = payloads.map(([route, key, value]) => ({
    route,
    key,
    value,
  }));
  return out as unknown as PayloadMapper<T>;
};
