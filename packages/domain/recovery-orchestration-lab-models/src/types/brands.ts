type Brand<T, B extends string> = T & { readonly __brand: B };

export type WorkspaceToken = Brand<string, 'WorkspaceToken'>;
export type ScenarioToken = Brand<string, 'ScenarioToken'>;
export type StageToken = Brand<string, 'StageToken'>;
export type CommandToken = Brand<string, 'CommandToken'>;
export type PolicyToken = Brand<string, 'PolicyToken'>;

export interface DomainIdParts {
  readonly namespace: string;
  readonly tenant: string;
  readonly sequence: string;
}

const buildToken = (parts: DomainIdParts, kind: string): string => `${kind}:${parts.namespace}/${parts.tenant}/${parts.sequence}`;

export const makeWorkspaceToken = (parts: DomainIdParts): WorkspaceToken => buildToken(parts, 'ws') as WorkspaceToken;
export const makeScenarioToken = (parts: DomainIdParts): ScenarioToken => buildToken(parts, 'scenario') as ScenarioToken;
export const makeStageToken = (parts: DomainIdParts): StageToken => buildToken(parts, 'stage') as StageToken;
export const makeCommandToken = (parts: DomainIdParts): CommandToken => buildToken(parts, 'command') as CommandToken;
export const makePolicyToken = (parts: DomainIdParts): PolicyToken => buildToken(parts, 'policy') as PolicyToken;

export const parseToken = (value: string): DomainIdParts => {
  const [namespace, payload] = value.split(':', 2);
  const [tenant, sequence] = (payload ?? '').split('/');
  if (!namespace || !tenant || !sequence) {
    throw new Error(`invalid token: ${value}`);
  }
  return {
    namespace,
    tenant,
    sequence,
  };
};

export const isWorkspaceToken = (value: string): value is WorkspaceToken => value.startsWith('ws:');
export const isScenarioToken = (value: string): value is ScenarioToken => value.startsWith('scenario:');
export const isStageToken = (value: string): value is StageToken => value.startsWith('stage:');
export const isCommandToken = (value: string): value is CommandToken => value.startsWith('command:');
export const isPolicyToken = (value: string): value is PolicyToken => value.startsWith('policy:');
