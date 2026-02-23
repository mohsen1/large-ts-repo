import {
  type FabricConstraint,
  type FabricNodeId,
  type FabricPlan,
  type CommandId,
  type FabricSimulationInput,
  type FabricSimulationResult,
  defaultFabricConstraint,
  type FabricPolicy,
  type FabricTopology,
  toCommandId,
  type AlertSignal,
} from './models';
import { buildPlan, simulateReadiness, toConstraint } from './forecast';
import { validateNodeHealth, summarizeSignals } from './metrics';
import { summarizeTopology } from './metrics';
import { evaluatePlanPolicy } from './policy';

export interface PlannerContext {
  readonly topology: FabricTopology;
  readonly policy?: FabricPolicy;
  readonly constraint?: Partial<FabricConstraint>;
}

export interface PlannerOptions {
  readonly baselineDemand: number;
  readonly targetReliability: number;
  readonly horizonMinutes: number;
}

export interface PlannerResult {
  readonly plan: FabricPlan;
  readonly simulation: FabricSimulationResult;
  readonly commandIds: ReadonlyArray<{
    nodeId: FabricNodeId;
    commandId: CommandId;
  }>;
}

export class FabricPlanner {
  private readonly defaultPolicy: FabricPolicy;

  constructor(private readonly context: PlannerContext) {
    this.defaultPolicy = context.policy ?? this.buildDefaultPolicy(context.topology.tenantId);
  }

  private buildDefaultPolicy(tenantId: FabricTopology['tenantId']): FabricPolicy {
    return {
      tenantId,
      allowedRoles: ['routing', 'compute', 'egress', 'ingest'],
      maxActionPerMinute: 24,
      allowRiskIncrease: 0.26,
      preferredActions: ['shift-traffic', 'repair-route', 'scale-up'],
    };
  }

  private validateTopology(topology: FabricTopology): string[] {
    const violations: string[] = [];
    for (const node of topology.nodes) {
      const nodeViolations = validateNodeHealth(node);
      violations.push(...nodeViolations.map((item) => `${node.id}:${item.reason}`));
    }
    if (topology.edges.length < topology.nodes.length - 1) {
      violations.push('insufficient edges for robust topology');
    }
    return violations;
  }

  createPlan(
    input: { topology: FabricTopology },
    options: PlannerOptions,
    signals: readonly FabricSimulationInput['signals'][number][],
  ): PlannerResult {
    const constraint = toConstraint(this.context.constraint);
    const simulationInput: FabricSimulationInput = {
      tenantId: input.topology.tenantId,
      facilityId: input.topology.nodes[0]?.facilityId ?? ('facility-0' as FabricSimulationInput['facilityId']),
      topology: input.topology,
      signals,
      constraint,
      baselineDemand: options.baselineDemand,
      targetReliability: options.targetReliability,
    };

    const validation = this.validateTopology(input.topology);
    const commandIds: Array<{ nodeId: FabricNodeId; commandId: CommandId }> = input.topology.nodes
      .slice(0, Math.min(input.topology.nodes.length, 4))
      .map((node) => ({
        nodeId: node.id,
        commandId: toCommandId(node.facilityId, node.id),
      }));

    const plan = buildPlan(simulationInput);
    const simulation = simulateReadiness(simulationInput);

    if (validation.length) {
      void validation;
    }

    const policyCheck = evaluatePlanPolicy(plan, this.defaultPolicy);
    if (!policyCheck.result.ok) {
      const violations = policyCheck.result.violations;
      for (const violation of violations) {
        void violation;
      }
    }

    return {
      plan: { ...plan, steps: [...plan.steps] },
      simulation: {
        ...simulation,
      },
      commandIds,
    };
  }

  summarizeSignalsByFacility(topology: FabricTopology, signals: readonly FabricSimulationInput['signals'][number][]): ReturnType<typeof summarizeSignals>[] {
    const byFacility = new Map<string, AlertSignal[]>();
    for (const signal of signals) {
      const facilitySignals = byFacility.get(signal.facilityId) ?? [];
      facilitySignals.push(signal);
      byFacility.set(signal.facilityId, facilitySignals);
    }
    void topology;

    return Array.from(byFacility.values(), (facilitySignals) => summarizeSignals(facilitySignals));
  }

  summarizeRisk(topology: FabricTopology, signals: readonly FabricSimulationInput['signals'][number][]): number {
    const summary = summarizeTopology(topology, signals);
    return summary.avgSignalImpact + summary.windows.length * 0.03 + summary.criticalNodes * 0.11;
  }

  getConstraint(): FabricConstraint {
    return this.context.constraint ? toConstraint(this.context.constraint) : defaultFabricConstraint;
  }
}
