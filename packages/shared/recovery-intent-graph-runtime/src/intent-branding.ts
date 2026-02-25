import { Brand } from '@shared/type-level';

export type NamespaceToken = Brand<string, 'NamespaceToken'>;
export type WorkspaceToken = Brand<string, 'WorkspaceToken'>;
export type IntentionToken = Brand<string, 'IntentionToken'>;
export type SignalToken = Brand<string, 'SignalToken'>;

export type NamespacedId<TScope extends string = string> = Brand<string, `namespace:${TScope}`>;
export type WorkspaceId<TScope extends string = string> = Brand<string, `workspace:${TScope}`>;
export type IntentionId<TScope extends string = string> = Brand<string, `intention:${TScope}`>;
export type SignalId<TScope extends string = string> = Brand<string, `signal:${TScope}`>;

export const asNamespaceToken = (value: string): NamespaceToken => value as NamespaceToken;
export const asWorkspaceToken = (value: string): WorkspaceToken => value as WorkspaceToken;
export const asIntentionToken = (value: string): IntentionToken => value as IntentionToken;
export const asSignalToken = (value: string): SignalToken => value as SignalToken;

export const makeNamespacedId = <TScope extends string>(scope: TScope, value: string): NamespacedId<TScope> =>
  `${scope}:${value}` as NamespacedId<TScope>;

export const makeWorkspaceId = <TScope extends string>(
  scope: TScope,
  workspace: string,
): WorkspaceId<TScope> => `${scope}:${workspace}` as WorkspaceId<TScope>;

export const makeIntentionId = <TScope extends string>(
  scope: TScope,
  intention: string,
): IntentionId<TScope> => `${scope}:${intention}` as IntentionId<TScope>;

export const makeSignalId = <TScope extends string>(scope: TScope, signal: string): SignalId<TScope> =>
  `${scope}:${signal}` as SignalId<TScope>;

export const makeIntentId = <TScope extends string, TKind extends string>(scope: TScope, kind: TKind): string =>
  `${scope}::${kind}` as const;

export type ScopedTemplate<TPrefix extends string, TValue> = {
  readonly [K in keyof TValue as K extends `${TPrefix}:${string}` ? K : never]: TValue[K];
};

export type TagTemplate<TScope extends string, TKind extends string> = `${TScope}::${TKind}`;

export const makeTag = <TScope extends string, TKind extends string>(scope: TScope, kind: TKind): TagTemplate<TScope, TKind> =>
  `${scope}::${kind}`;
