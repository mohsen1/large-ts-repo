import { applyRules, parsePolicy } from '@domain/policy-engine';
import {
  PolicyContextSpec,
  PolicyNode,
  PolicyPlan,
  PolicyPlanStep,
  PolicySimulationResult,
  PolicySimulationPoint,
} from './models';

export interface SimulationContext extends PolicyContextSpec {}

export interface SimulationInput {
  plan: PolicyPlan;
  nodes: ReadonlyMap<string, PolicyNode>;
  contexts: readonly SimulationContext[];
  dryRunLabel?: string;
}

interface CacheEntry {
  key: string;
  value: boolean;
  millis: number;
}

const makeCacheKey = (expression: string, context: PolicyContextSpec): string =>
  `${expression}::${context.principal}::${context.resource}::${context.action}::${JSON.stringify(context.attributes)}`;

export const simulateStep = (step: PolicyPlanStep, node: PolicyNode, context: SimulationContext, cache: Map<string, CacheEntry>): PolicySimulationPoint => {
  const started = Date.now();
  const expression = parsePolicy(node.artifact.expression);
  const cacheKey = makeCacheKey(node.artifact.expression, context);
  const cached = cache.get(cacheKey);

  let allowed = false;
  let fromCache = false;
  if (cached && Date.now() - cached.millis < 60_000) {
    allowed = cached.value;
    fromCache = true;
  } else {
    const report = applyRules([expression], {
      principal: context.principal,
      resource: context.resource,
      action: context.action,
      attributes: context.attributes,
      now: new Date(context.now),
    });
    allowed = report.final === 'allow';
    cache.set(cacheKey, {
      key: cacheKey,
      value: allowed,
      millis: Date.now(),
    });
  }

  const elapsed = Date.now() - started;
  return {
    request: context,
    decisions: [
      {
        artifactId: node.artifact.id,
        principal: context.principal,
        allowed,
        rationale: [
          `decision=${allowed ? 'allow' : 'deny'}`,
          `step=${step.order}`,
          `batch=${step.batchId}`,
          `cached=${fromCache}`,
          `expr=${node.artifact.expression.slice(0, 32)}`,
        ],
        evaluatedAt: new Date().toISOString(),
      },
    ],
    latencyMs: elapsed,
    cacheHit: fromCache,
  };
};

export const percentiles = (values: readonly number[]): { p50: number; p90: number; p95: number; p99: number } => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
  return {
    p50: at(0.5),
    p90: at(0.9),
    p95: at(0.95),
    p99: at(0.99),
  };
};

export const runPlanSimulation = (input: SimulationInput): PolicySimulationResult[] => {
  const cache = new Map<string, CacheEntry>();
  const resultByNode = new Map<string, PolicySimulationPoint[]>();

  for (const step of input.plan.steps) {
    for (const nodeId of step.nodeIds) {
      const node = input.nodes.get(nodeId);
      if (!node) continue;
      const points = resultByNode.get(node.id) ?? [];
      for (const context of input.contexts) {
        points.push(simulateStep(step, node, context, cache));
      }
      resultByNode.set(node.id, points);
    }
  }

  const output: PolicySimulationResult[] = [];
  for (const [nodeId, outcomes] of resultByNode) {
    const latencies = outcomes.map((entry) => entry.latencyMs);
    const total = outcomes.reduce((acc, current) => acc + (current.decisions[0]?.allowed ? 1 : 0), 0);
    const summary = percentiles(latencies);
    output.push({
      nodeId: nodeId as PolicySimulationResult['nodeId'],
      outcomes,
      successRatio: outcomes.length === 0 ? 0 : total / outcomes.length,
      p95LatencyMs: summary.p95,
    });
  }
  return output;
};
