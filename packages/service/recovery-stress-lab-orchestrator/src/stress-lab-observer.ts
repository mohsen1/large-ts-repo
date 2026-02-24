import { z } from 'zod';
import {
  normalizeGraphInput,
  collectTraversal,
  type WorkflowGraph,
  type GraphInput,
  type WorkloadSignal,
} from '@domain/recovery-stress-lab-intelligence/flow-graph';
import { executeFleet, type FleetRunOptions, type FleetRunResult } from './stress-lab-fleet';
import { buildFleetPlan } from './stress-lab-fleet';

export type ObserverMode = 'audit' | 'drill' | 'canary';

export interface FleetObserverConfig {
  tenant: string;
  zone: string;
  mode: ObserverMode;
}

export interface ObserverFrame {
  readonly at: number;
  readonly action: string;
  readonly status: 'ok' | 'warn' | 'error';
}

export interface ObserverSnapshot {
  readonly tenant: string;
  readonly zone: string;
  readonly mode: ObserverMode;
  readonly signatures: readonly string[];
}

const observerSchema = z.object({
  tenant: z.string().min(2),
  zone: z.string().min(2),
  mode: z.enum(['audit', 'drill', 'canary']),
});

const normalizeConfig = (input: unknown): FleetObserverConfig => {
  const parsed = observerSchema.parse(input);
  return {
    tenant: parsed.tenant,
    zone: parsed.zone,
    mode: parsed.mode,
  } as FleetObserverConfig;
};

const emitFrame = (action: string, status: ObserverFrame['status']): ObserverFrame => ({
  at: Date.now(),
  action,
  status,
});

const buildRunSignature = (graph: WorkflowGraph, mode: ObserverMode): string => {
  const signature = collectTraversal(graph, graph.nodes[0]?.id).length;
  return `${mode}:${graph.nodes.length}:${graph.edges.length}:${signature}`;
};

export const runObserver = async (input: unknown): Promise<readonly ObserverFrame[]> => {
  const config = normalizeConfig(input);
  const frames: ObserverFrame[] = [
    emitFrame(`boot-${config.mode}`, 'ok'),
    emitFrame(`tenant-${config.tenant}`, 'ok'),
    emitFrame(`zone-${config.zone}`, 'ok'),
  ];

  const fixture: GraphInput = {
    region: config.zone,
    nodes: [
      { id: 'seed', lane: 'observe', kind: 'seed', outputs: ['simulate'] },
      { id: 'simulate', lane: 'simulate', kind: 'simulate', outputs: ['recommend'] },
      { id: 'recommend', lane: 'recommend', kind: 'recommend', outputs: ['restore'] },
      { id: 'restore', lane: 'restore', kind: 'restore', outputs: [] },
    ],
    edges: [
      { id: 'seed->simulate', from: 'seed', to: ['simulate'], direction: 'northbound', channel: 'seed' },
      { id: 'simulate->recommend', from: 'simulate', to: ['recommend'], direction: 'interlane', channel: 'simulate' },
      { id: 'recommend->restore', from: 'recommend', to: ['restore'], direction: 'southbound', channel: 'recommend' },
    ],
  };

  const graph = normalizeGraphInput(fixture);
  frames.push(emitFrame(`graph=${buildRunSignature(graph, config.mode)}`, graph.nodes.length === 0 ? 'warn' : 'ok'));

  const runInput: FleetRunOptions = {
    tenant: config.tenant,
    zone: config.zone,
    graph: fixture,
    scripts: ['start', 'wait', 'validate'],
    strategyInput: {
      tenant: config.tenant,
      runId: `${config.tenant}::observer-${config.mode}`,
      signals: [],
      forecastScore: 0.73,
    },
  };

  await executeFleet(runInput);
  frames.push(emitFrame(`run-${config.mode}`, 'ok'));

  return frames;
};

export const collectObserverMetrics = async (input: unknown): Promise<ObserverSnapshot> => {
  const config = normalizeConfig(input);
  const frames = await runObserver(input);
  return {
    tenant: config.tenant,
    zone: config.zone,
    mode: config.mode,
    signatures: frames.map((frame) => `${frame.action}:${frame.status}`),
  };
};

export const inspectFleetQuick = async (
  config: FleetObserverConfig,
  fallbackSignals: readonly WorkloadSignal[],
): Promise<number> => {
  const graph: GraphInput = {
    region: config.zone,
    nodes: [
      { id: 'seed', lane: 'observe', kind: 'seed', outputs: ['recommend'] },
      { id: 'recommend', lane: 'recommend', kind: 'recommend', outputs: [] },
    ],
    edges: [{ id: 'seed->recommend', from: 'seed', to: ['recommend'], direction: 'northbound', channel: 'quick' }],
  };

  const plan = buildFleetPlan(config.tenant, config.zone, graph);
  return (await Promise.resolve(fallbackSignals.length + plan.graph.nodes.length + plan.graph.edges.length)) as number;
};

export const normalizeMode = (mode: string): ObserverMode => {
  if (mode === 'drill' || mode === 'canary') {
    return mode;
  }
  return 'audit';
};

export const summarizeFrames = (frames: readonly ObserverFrame[]): string =>
  frames
    .map((frame) => `${frame.at}:${frame.action}:${frame.status}`)
    .join('\n');
