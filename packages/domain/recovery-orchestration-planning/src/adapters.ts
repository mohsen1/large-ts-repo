import type {
  StrategyTemplate,
  StrategyPlan,
  StrategyRun,
  StrategyRunId,
  OrchestrationTemplateId,
  CommandToken,
  StrategyDependency,
  StrategyStepNode,
  StrategyCommand,
  StrategyDraft,
  RiskPosture,
  StrategySimulationWindow,
  StrategyRunStatus,
} from './types';
import { brandTemplateId, brandCommandToken } from './types';

const phaseValues = ['inbound', 'simulation', 'release', 'validation', 'postmortem'] as const;
const postureValues = ['low', 'medium', 'high', 'critical'] as const;
const statusValues = ['planned', 'running', 'waiting', 'completed', 'blocked'] as const;

const isPhase = (raw: unknown): raw is (typeof phaseValues)[number] =>
  typeof raw === 'string' && (phaseValues as readonly string[]).includes(raw);

const isPosture = (raw: unknown): raw is (typeof postureValues)[number] =>
  typeof raw === 'string' && (postureValues as readonly string[]).includes(raw);

const asPhase = (raw: unknown): StrategyStepNode['phase'] => (isPhase(raw) ? raw : 'simulation');

const parseStatus = (raw: unknown): StrategyRunStatus =>
  typeof raw === 'string' && (statusValues as readonly string[]).includes(raw) ? (raw as StrategyRunStatus) : 'planned';

const safeString = (value: unknown): string => (typeof value === 'string' ? value : '');
const safeNumber = (value: unknown): number => (typeof value === 'number' ? value : 0);
const safeBoolean = (value: unknown): boolean => (typeof value === 'boolean' ? value : false);
const parseWindow = (raw: unknown): StrategySimulationWindow | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const row = raw as Record<string, unknown>;
  const riskPosture = isPosture(row.riskPosture) ? row.riskPosture : 'low';
  const expectedRto = safeNumber(row.expectedRto);
  const commandCount = safeNumber(row.commandCount);

  return {
    minuteOffset: safeNumber(row.minuteOffset),
    riskPosture,
    expectedRto,
    commandCount,
    signalDensity: safeNumber(row.signalDensity),
  };
};

export const parseTemplate = (raw: unknown): StrategyTemplate | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const row = raw as Record<string, unknown>;
  const steps = Array.isArray(row.steps) ? (row.steps as unknown[]) : [];
  const parsedSteps = steps.map((rawStep) => parseStep(rawStep)).filter((step): step is StrategyStepNode => step !== undefined);
  if (parsedSteps.length === 0) {
    return undefined;
  }

  return {
    templateId: brandTemplateId(safeString(row.templateId)),
    name: safeString(row.name),
    description: safeString(row.description),
    phase: asPhase(row.phase),
    createdBy: safeString(row.createdBy),
    createdAt: safeString(row.createdAt),
    targets: Array.isArray(row.targets)
      ? (row.targets as unknown[])
          .map((rawTarget) => parseTarget(rawTarget))
          .filter((target): target is StrategyTemplate['targets'][number] => target !== undefined)
      : [],
    dependencies: Array.isArray(row.dependencies)
      ? (row.dependencies as unknown[])
          .map((rawDependency) => parseDependency(rawDependency))
          .filter((dependency): dependency is StrategyDependency => dependency !== undefined)
      : [],
    steps: parsedSteps,
  };
};

const parseDependency = (raw: unknown): StrategyDependency | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const row = raw as Record<string, unknown>;
  const from = safeString(row.from);
  const to = Array.isArray(row.to) ? (row.to as unknown[]).map(safeString).filter(Boolean) : [];
  const soft = safeBoolean(row.soft);
  return {
    from,
    to,
    soft,
  };
};

const parseConstraint = (raw: unknown): { key: string; value: string | number | boolean; optional: boolean } | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const row = raw as Record<string, unknown>;
  return {
    key: safeString(row.key),
    value: typeof row.value === 'string' || typeof row.value === 'number' || typeof row.value === 'boolean' ? row.value : '',
    optional: safeBoolean(row.optional),
  };
};

const parseCommand = (raw: unknown): StrategyCommand | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const row = raw as Record<string, unknown>;
  return {
    commandId: safeString(row.commandId),
    commandType: safeString(row.commandType),
    targetId: safeString(row.targetId),
    timeoutSeconds: safeNumber(row.timeoutSeconds),
    retryLimit: safeNumber(row.retryLimit),
    estimatedMinutes: safeNumber(row.estimatedMinutes),
    requiresHumanApproval: safeBoolean(row.requiresHumanApproval),
    token: brandCommandToken(safeString(row.token)),
    dependencies: Array.isArray(row.dependencies) ? row.dependencies.map(safeString) : [],
  };
};

const parseStep = (raw: unknown): StrategyStepNode | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const row = raw as Record<string, unknown>;
  return {
    stepId: safeString(row.stepId),
    runbook: safeString(row.runbook),
    phase: asPhase(row.phase),
    command: parseCommand(row.command) ?? {
      commandId: 'none',
      commandType: 'noop',
      targetId: '',
      timeoutSeconds: 0,
      retryLimit: 0,
      estimatedMinutes: 0,
      requiresHumanApproval: false,
      token: brandCommandToken('auto'),
      dependencies: [],
    },
    expectedRiskReduction: safeNumber(row.expectedRiskReduction),
    maxParallelism: Math.max(1, safeNumber(row.maxParallelism)),
    constraints: Array.isArray(row.constraints)
      ? (row.constraints as unknown[])
          .map((constraint) => parseConstraint(constraint))
          .filter((constraint): constraint is StrategyTemplate['steps'][number]['constraints'][number] => constraint !== undefined)
      : [],
    canAbort: safeBoolean(row.canAbort),
  };
};

const parseTargets = (raw: unknown): StrategyTemplate['targets'][number] | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const row = raw as Record<string, unknown>;
  return {
    targetId: safeString(row.targetId),
    serviceName: safeString(row.serviceName),
    zone: safeString(row.zone),
    ownerTeam: safeString(row.ownerTeam),
    baselineRtoMinutes: safeNumber(row.baselineRtoMinutes),
    targetRtoMinutes: safeNumber(row.targetRtoMinutes),
    criticality: safeNumber(row.criticality),
  };
};

const parseTarget = (raw: unknown): StrategyTemplate['targets'][number] | undefined => parseTargets(raw);

export const parsePlan = (raw: unknown): StrategyPlan | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const row = raw as Record<string, unknown>;
  const windows = Array.isArray(row.windows)
    ? (row.windows as unknown[]).map((window) => parseWindow(window)).filter((window) => window !== undefined)
    : [];
  const dependencies = Array.isArray(row.dependencies)
    ? (row.dependencies as unknown[])
        .map((rawDependency) => parseDependency(rawDependency))
        .filter((dependency): dependency is StrategyDependency => dependency !== undefined)
    : [];

  return {
    strategyId: safeString(row.strategyId),
    templateId: brandTemplateId(safeString(row.templateId)),
    draftId: safeString(row.draftId),
    runbookTokens: Array.isArray(row.runbookTokens)
      ? (row.runbookTokens as unknown[])
          .map((token) => brandCommandToken(safeString(token)))
          .filter(Boolean)
      : [],
    windows,
    dependencies,
    executionPriority: Array.isArray(row.executionPriority)
      ? (row.executionPriority as unknown[]).map(safeString)
      : [],
  };
};

export const parseRun = (raw: unknown): StrategyRun | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const row = raw as Record<string, unknown>;
  const plan = parsePlan(row.plan);
  if (!plan) {
    return undefined;
  }

  return {
    runId: row.runId as StrategyRunId,
    templateId: brandTemplateId(safeString(row.templateId)),
    draftId: safeString(row.draftId),
    tenantId: safeString(row.tenantId),
    startedAt: safeString(row.startedAt),
    status: parseStatus(row.status),
    targetIds: Array.isArray(row.targetIds) ? (row.targetIds as unknown[]).map(safeString) : [],
    score: safeNumber(row.score),
    riskPosture: isPosture(row.riskPosture) ? (row.riskPosture as RiskPosture) : 'low',
    plan,
  };
};

export const parseDraft = (raw: unknown): StrategyDraft | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const row = raw as Record<string, unknown>;
  const windows = Array.isArray(row.stepsWindow)
    ? (row.stepsWindow as unknown[]).map((window) => parseWindow(window)).filter((window) => window !== undefined)
    : [];
  const template = parseTemplate(row.template);
  if (!template) {
    return undefined;
  }

  return {
    draftId: safeString(row.draftId),
    owner: safeString(row.owner),
    template,
    requestedAt: safeString(row.requestedAt),
    priority: isPosture(row.priority) ? (row.priority as StrategyDraft['priority']) : 'low',
    budgetMinutes: safeNumber(row.budgetMinutes),
    stepsWindow: windows,
  };
};

export const parseTemplateId = (value: unknown): OrchestrationTemplateId | undefined => {
  const raw = safeString(value);
  return raw.length > 0 ? brandTemplateId(raw) : undefined;
};

export const parseRunId = (value: unknown): StrategyRunId | undefined => {
  const raw = safeString(value);
  return raw.length > 0 ? (raw as StrategyRunId) : undefined;
};

export const parseCommandToken = (value: unknown): CommandToken | undefined => {
  const raw = safeString(value);
  return raw.length > 0 ? brandCommandToken(raw) : undefined;
};
