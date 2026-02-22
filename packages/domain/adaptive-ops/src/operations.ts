import { z } from 'zod';
import { AdaptivePolicy, SignalSample, SignalKind, AdaptiveDecision, AdaptiveAction } from './types';
import { computeCoverageRatio, buildWorkflowOutcome } from './workflows';

export interface OperationIntent {
  tenantId: string;
  mode: 'stabilize' | 'optimize' | 'observe';
  allowScale: boolean;
  maxConcurrency: number;
  targetWindowSeconds: number;
  preferredKinds: readonly SignalKind[];
}

export interface OperationOutput {
  tenantId: string;
  acceptedPolicies: readonly AdaptivePolicy[];
  selectedActions: readonly AdaptiveAction[];
  topDecisions: readonly AdaptiveDecision[];
  coverage: number;
  reason: 'none' | 'partial' | 'full';
}

export interface ExecutionCommand {
  incidentId: string;
  actions: readonly AdaptiveAction[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata: {
    generatedAt: string;
    source: string;
    tenantId: string;
  };
}

const operationIntentSchema = z.object({
  tenantId: z.string().min(1),
  mode: z.enum(['stabilize', 'optimize', 'observe']),
  allowScale: z.boolean(),
  maxConcurrency: z.number().int().positive(),
  targetWindowSeconds: z.number().int().positive(),
  preferredKinds: z.array(z.enum(['error-rate', 'latency', 'availability', 'cost-variance', 'manual-flag'])),
});

export type OperationIntentInput = z.infer<typeof operationIntentSchema>;

export const parseOperationIntent = (value: unknown): OperationIntent => operationIntentSchema.parse(value);

export const extractActionDensity = (decisions: readonly AdaptiveDecision[]): number => {
  const total = decisions.reduce((acc, decision) => acc + decision.selectedActions.length, 0);
  return decisions.length === 0 ? 0 : total / decisions.length;
}

export const clampPolicyWindow = (windowSeconds: number): number => Math.max(30, Math.min(windowSeconds, 3600));

export const shouldScale = (intent: OperationIntent, decision: AdaptiveDecision): boolean => {
  if (!intent.allowScale) return false;
  if (intent.mode === 'observe') return false;
  return decision.selectedActions.some((action) => action.type === 'scale-up' || action.type === 'reroute');
}

export const buildCommands = (decisions: readonly AdaptiveDecision[], tenantId: string): readonly ExecutionCommand[] => {
  return decisions.flatMap((decision, index) => {
    return decision.selectedActions.map((action) => ({
      incidentId: `${tenantId}-${Date.now()}-${index}-${Math.floor(action.intensity * 1000)}`,
      actions: [action],
      priority: decision.risk === 'critical' ? 'critical' : decision.risk === 'high' ? 'high' : 'medium',
      metadata: {
        generatedAt: new Date().toISOString(),
        source: 'adaptive-ops-domain',
        tenantId: `${tenantId}`,
      },
    }));
  });
};

export const calculateReason = (coverage: number, count: number): OperationOutput['reason'] => {
  if (coverage >= 0.8 && count > 0) return 'full';
  if (coverage >= 0.35 && count > 0) return 'partial';
  return 'none';
};

export const computeOperationOutput = (
  policies: readonly AdaptivePolicy[],
  signals: readonly SignalSample[],
  intent: OperationIntent,
): OperationOutput => {
  const safeWindowSeconds = clampPolicyWindow(intent.targetWindowSeconds);
  const acceptedPolicies = policies.filter((policy) => policy.active && policy.allowedSignalKinds.some((kind) => intent.preferredKinds.includes(kind)));
  const window = {
    start: new Date(Date.now() - safeWindowSeconds * 1000).toISOString(),
    end: new Date().toISOString(),
    timezone: 'utc',
  };

  const outcome = buildWorkflowOutcome(
    intent.tenantId,
    { ...window, timezone: window.timezone },
    acceptedPolicies,
    signals,
    'down',
    0.15,
  );

  const actions = outcome.planActions;
  const topDecisions = outcome.decisions.slice(0, intent.maxConcurrency);
  const coverage = computeCoverageRatio(topDecisions, acceptedPolicies);
  const reason = calculateReason(coverage, topDecisions.length);
  return {
    tenantId: intent.tenantId,
    acceptedPolicies,
    selectedActions: actions,
    topDecisions,
    coverage,
    reason,
  };
};

export const flattenCommands = (commands: readonly ExecutionCommand[]): Record<string, ExecutionCommand[]> => {
  return commands.reduce<Record<string, ExecutionCommand[]>>((acc, command) => {
    const key = command.priority;
    acc[key] = acc[key] ?? [];
    acc[key].push(command);
    return acc;
  }, {} as Record<string, ExecutionCommand[]>);
};

export const normalizePriorityCounts = (commands: readonly ExecutionCommand[]): Record<ExecutionCommand['priority'], number> => {
  return commands.reduce(
    (acc, command) => {
      acc[command.priority] = (acc[command.priority] ?? 0) + 1;
      return acc;
    },
    {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
  );
};

export const prioritizeCommands = (commands: readonly ExecutionCommand[]): readonly ExecutionCommand[] => {
  const rank: Record<ExecutionCommand['priority'], number> = {
    critical: 3,
    high: 2,
    medium: 1,
    low: 0,
  };
  return [...commands].sort((left, right) => rank[right.priority] - rank[left.priority]);
};
