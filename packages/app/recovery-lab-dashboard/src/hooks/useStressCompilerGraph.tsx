import { useEffect, useMemo, useState } from 'react';
import {
  executeRoutes,
  buildManifest,
  type StressCompilerCommand,
  type StressCompilerManifest,
  type StressCompilerEnvelope,
} from '../services/stressCompilerService';
import { networkRouteCatalog, type NetworkRoutePattern, type FlowBranch } from '@shared/type-level';

export type StressGraphNode = {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly active: boolean;
};

export type StressGraphEdge = {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
};

export type StressCompilerState = {
  readonly manifest: StressCompilerManifest | null;
  readonly nodes: readonly StressGraphNode[];
  readonly edges: readonly StressGraphEdge[];
  readonly envelopes: readonly StressCompilerEnvelope[];
  readonly running: boolean;
  readonly errors: readonly string[];
};

export const useStressCompilerGraph = () => {
  const [state, setState] = useState<StressCompilerState>({
    manifest: null,
    nodes: [],
    edges: [],
    envelopes: [],
    running: false,
    errors: [],
  } satisfies StressCompilerState);

  const seeds = useMemo<NetworkRoutePattern[]>(() => networkRouteCatalog.slice(0, 24) as NetworkRoutePattern[], []);

  const hydrate = async () => {
    setState((current) => ({ ...current, running: true, errors: [] }));
    try {
      const manifest = await buildManifest();
      const routes = seeds.map((route, index) => ({
        route,
        branch: (index % 2 === 0 ? 'dispatch' : 'route') as FlowBranch,
        context: {
          mode: index % 3 === 0 ? 'strict' : index % 3 === 1 ? 'relaxed' : 'dry-run',
          runId: `run-${route}` as `run-${string}`,
          depth: (route.length % 7) + 1,
        },
      } satisfies StressCompilerCommand));
      const envelopes = await executeRoutes(routes);
      const nodes = envelopes.map((entry, index) => {
        const label = `${entry.parsed.entity}:${entry.parsed.action}`;
        return {
          id: `${index}`,
          label,
          weight: entry.parsed.action.length + entry.parsed.id.length,
          active: typeof entry.parsed.entity === 'string',
        } satisfies StressGraphNode;
      });
      const edges = nodes.map((node, index) => ({
        from: node.id,
        to: index === nodes.length - 1 ? node.id : `${index + 1}`,
        reason: `trace-${index}`,
      })) satisfies StressGraphEdge[];
      setState({
        manifest,
        nodes,
        edges,
        envelopes,
        running: false,
        errors: [],
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        running: false,
        errors: [...current.errors, (error as Error).message],
      }));
    }
  };

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const graph = useMemo(() => ({
    nodes: state.nodes,
    edges: state.edges,
  }), [state.nodes, state.edges]);

  return {
    state,
    graph,
    refresh: hydrate,
  } as const;
};
