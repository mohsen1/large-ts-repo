import {
  asLabOperator,
  asLabTenantId,
  asLabWorkspaceId,
  buildBlueprintId,
  buildRunId,
  defaultDomains,
  defaultVerbs,
  type ControlLabDomain,
  type ControlLabVerb,
  pluginTopicFor,
  type ControlLabBlueprint,
} from './types';

export interface LabManifestShape {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly operator: string;
  readonly signalClasses: readonly ControlLabDomain[];
  readonly stageOrder: readonly ControlLabVerb[];
}

export interface LabManifestInput extends LabManifestShape {}

export interface LabManifestOutput extends LabManifestShape {}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const includesAll = (candidate: readonly string[], allowed: readonly string[]) => candidate.every((entry) => allowed.includes(entry));

export const isManifestLike = (value: unknown): value is LabManifestOutput => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.tenantId === 'string' &&
    typeof value.workspaceId === 'string' &&
    typeof value.operator === 'string' &&
    isStringArray(value.signalClasses) &&
    isStringArray(value.stageOrder) &&
    includesAll(value.signalClasses, [...defaultDomains]) &&
    includesAll(value.stageOrder, [...defaultVerbs])
  );
};

export const parseManifest = (value: unknown): LabManifestOutput => {
  if (!isManifestLike(value)) {
    throw new Error('Invalid lab manifest input');
  }
  return value;
};

export interface ManifestContext {
  readonly pluginTopics: readonly string[];
  readonly resolved: boolean;
}

export interface ManifestSummary {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly topicCount: number;
  readonly stageCount: number;
  readonly resolved: boolean;
}

export const readManifestSummary = (input: LabManifestInput, extraTopics: readonly string[] = []): ManifestSummary => {
  const parsed = parseManifest(input);
  const runId = buildRunId(parsed.tenantId, parsed.workspaceId);
  const pluginTopics = [...new Set([...parsed.signalClasses, ...extraTopics])].map((topic) => pluginTopicFor(topic));
  return {
    tenantId: parsed.tenantId,
    workspaceId: parsed.workspaceId,
    runId,
    topicCount: pluginTopics.length,
    stageCount: parsed.stageOrder.length,
    resolved: parsed.operator.length > 0 && parsed.stageOrder.length > 0,
  };
};

export const buildManifestSnapshot = (tenantId: string, workspaceId: string, operator: string): LabManifestOutput => ({
  tenantId,
  workspaceId,
  operator,
  signalClasses: [...defaultDomains],
  stageOrder: [...defaultVerbs],
});

export const enrichManifestDefaults = (input: Partial<LabManifestInput>): LabManifestOutput => {
  const base = buildManifestSnapshot(input.tenantId ?? 'global', input.workspaceId ?? 'default', input.operator ?? 'ops');
  return {
    ...base,
    ...input,
    signalClasses: input.signalClasses?.length ? input.signalClasses : base.signalClasses,
    stageOrder: input.stageOrder?.length ? input.stageOrder : base.stageOrder,
  };
};

export const manifestToBlueprintId = (input: LabManifestOutput): string => String(buildBlueprintId(input.tenantId, input.workspaceId));

export const manifestWithContext = (input: LabManifestInput): ManifestContext => {
  const parsed = parseManifest(input);
  return {
    resolved: parsed.operator.length > 0,
    pluginTopics: parsed.signalClasses.map((topic) => pluginTopicFor(topic)),
  };
};

export const manifestToBlueprint = (input: LabManifestInput): ControlLabBlueprint => {
  const parsed = parseManifest(input);
  return {
    blueprintId: buildBlueprintId(parsed.tenantId, parsed.workspaceId),
    tenantId: asLabTenantId(parsed.tenantId),
    workspaceId: asLabWorkspaceId(parsed.workspaceId),
    signalClasses: parsed.signalClasses,
    stageOrder: parsed.stageOrder,
    operator: asLabOperator(parsed.operator),
    startedAt: new Date().toISOString(),
    pluginKinds: [...parsed.signalClasses],
  };
};

export const manifestContext = (tenantId: string, workspaceId: string, operator: string): ManifestContext =>
  manifestWithContext({ tenantId, workspaceId, operator, signalClasses: [...defaultDomains], stageOrder: [...defaultVerbs] });
