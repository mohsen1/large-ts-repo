import type {
  FabricCommand,
  FabricPolicy,
  FabricPlanSelection,
  FabricExecutionContext,
  FabricCommandMap,
} from './types';
import { decidePolicy } from './policy';
import { computeDependencyGraph, orderedExecutionPlan } from './graph';

export const rankByPriority = (commands: readonly FabricCommand[]): readonly FabricCommand[] => {
  return [...commands].sort((left, right) => left.priority - right.priority);
};

export const rankByBlastRadius = (commands: readonly FabricCommand[]): readonly FabricCommand[] => {
  return [...commands].sort((left, right) => left.blastRadius - right.blastRadius);
};

export const rankByApprovals = (commands: readonly FabricCommand[]): readonly FabricCommand[] => {
  return [...commands].sort((left, right) => left.requiresApprovals - right.requiresApprovals);
};

export const rankByWindowCoverage = (
  commands: readonly FabricCommand[],
  context: FabricExecutionContext,
): readonly FabricCommand[] => {
  return [...commands].sort((left, right) => {
    const leftWindows = left.requiresWindows.length + context.signals.length;
    const rightWindows = right.requiresWindows.length + context.signals.length;
    return leftWindows - rightWindows;
  });
};

export const selectCommands = (
  commands: readonly FabricCommand[],
  context: FabricExecutionContext,
  policy: FabricPolicy,
  limit = 20,
): FabricPlanSelection[] => {
  const decision = decidePolicy(policy, context, commands);
  const ordered = [...commands].sort((left, right) => {
    const leftScore = left.requiresApprovals + left.priority;
    const rightScore = right.requiresApprovals + right.priority;
    return leftScore - rightScore;
  });

  return ordered
    .slice(0, limit)
    .map((command, index) => ({
      command,
      selected: decision.approved,
      rank: index,
    }));
};

export const selectCommandMap = (commands: readonly FabricCommand[]): FabricCommandMap => {
  const map = new Map<FabricCommand['id'], FabricCommand>();
  for (const command of commands) {
    map.set(command.id, command);
  }
  return map;
};

export const selectByCoverage = (commands: readonly FabricCommand[], top = 10): readonly FabricCommand[] => {
  const ordered = rankByWindowCoverage(commands, {
    tenantId: 'tenant-coverage' as never,
    fabricId: 'fabric-coverage' as never,
    program: {
      id: 'program-coverage' as never,
      tenant: 'tenant-coverage' as never,
      service: 'service-coverage' as never,
      name: 'coverage',
      description: 'coverage',
      priority: 'bronze',
      mode: 'preventive',
      window: {
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 120_000).toISOString(),
        timezone: 'UTC',
      },
      topology: {
        rootServices: ['svc-coverage'],
        fallbackServices: [],
        immutableDependencies: [],
      },
      constraints: [],
      steps: [],
      owner: 'coverage',
      tags: ['coverage'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    incident: {
      id: 'incident-coverage' as never,
      tenantId: 'tenant-coverage' as never,
      serviceId: 'service-coverage' as never,
      title: 'coverage',
      details: 'coverage',
      state: 'detected',
      triage: {
        tenantId: 'tenant-coverage' as never,
        serviceId: 'service-coverage' as never,
        observedAt: new Date().toISOString(),
        source: 'ops-auto',
        severity: 'sev4',
        labels: [],
        confidence: 1,
        signals: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    policy: {
      id: 'policy-coverage' as never,
      tenantId: 'tenant-coverage' as never,
      name: 'coverage',
      description: 'coverage',
      readinessThreshold: 'cold',
      riskTolerance: 'green',
      maxParallelism: 2,
      maxRetries: 1,
      windowHours: { min: 1, max: 4 },
      gates: [],
    },
    signals: [],
    runStates: [],
  });

  const graph = computeDependencyGraph({
    commandIds: ordered.map((command) => command.id),
    edges: [],
    zones: { serial: ordered.map((command) => command.id), parallel: [], staged: [] },
    metadata: {},
  });

  const order = orderedExecutionPlan({
    commandIds: ordered.map((command) => command.id),
    edges: [...graph.values()].flatMap((node) =>
      node.dependencies.map((dependency) => ({
        from: dependency,
        to: node.commandId,
        mode: 'hard',
        mandatory: true,
        rationale: 'coverage',
      })),
    ),
    zones: { serial: ordered.map((command) => command.id), parallel: [], staged: [] },
    metadata: {},
  });

  const selected: FabricCommand['id'][] = [...new Set(order)];
  return ordered.filter((command) => selected.includes(command.id)).slice(0, top);
};
