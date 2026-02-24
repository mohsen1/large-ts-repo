import { useCallback, useEffect, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import {
  asRouteId,
  asTenantId,
  type LatticeBlueprintManifest,
  createPlanContext,
  makeSessionConfig,
  withLatticeSession,
  type LatticeTenantId,
} from '@domain/recovery-lattice';
import {
  createLatticeOrchestrator,
  type RecoveryLatticeOrchestrator,
  runPlannerDryRun,
} from '@service/recovery-lattice-orchestrator';
import {
  type LatticeOrchestratorRequest,
  type LatticeOrchestratorResult,
  type LatticeOrchestratorMode,
} from '@service/recovery-lattice-orchestrator';

type StudioState = {
  readonly blueprints: readonly LatticeBlueprintManifest[];
  readonly selectedBlueprintId: string;
  readonly mode: LatticeOrchestratorMode;
  readonly routeId: string;
  readonly trace: string | null;
  readonly running: boolean;
  readonly log: readonly string[];
  readonly stageSummaries: readonly { readonly id: string; readonly steps: number; readonly mode: LatticeOrchestratorMode }[];
};

const buildRouteId = (tenant: string, mode: StudioState['mode']): string => `${tenant}:${mode}:route`;

const fallbackBlueprint = (): LatticeBlueprintManifest => ({
  tenantId: asTenantId('tenant:fallback'),
  blueprintId: withBrand('blueprint:tenant:fallback:demo:id', 'blueprint:tenant:fallback:demo:id'),
  name: 'adaptive-lattice-fallback',
  version: '0.0.1',
  state: 'draft',
  route: asRouteId('tenant:fallback:adaptive'),
  steps: [
    {
      kind: 'transform',
      id: withBrand('step:seed:1:id', 'blueprint-step:seed:1:id'),
      target: 'seed',
      payloadSchema: {},
      tags: [],
      required: true,
    },
  ],
});

const parseId = (blueprint: LatticeBlueprintManifest): string =>
  `${String(blueprint.tenantId)}:${blueprint.name}:${blueprint.version}`;

const asStringValue = (value: string | undefined, fallback: string): string => value?.trim() || fallback;

export const useLatticeStudio = (
  tenantId: string,
  initialBlueprints: readonly LatticeBlueprintManifest[] = [],
): {
  readonly state: StudioState;
  readonly setMode: (mode: StudioState['mode']) => void;
  readonly setBlueprintById: (blueprintId: string) => void;
  readonly setRouteId: (routeId: string) => void;
  readonly run: () => Promise<void>;
  readonly stop: () => Promise<void>;
} => {
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>('');
  const [mode, setMode] = useState<StudioState['mode']>('analysis');
  const [routeId, setRouteId] = useState<string>(buildRouteId(tenantId, 'analysis'));
  const [trace, setTrace] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);

  const [orchestrator, setOrchestrator] = useState<RecoveryLatticeOrchestrator | null>(null);

  useEffect(() => {
    let active = true;
    createLatticeOrchestrator({
      tenantId: asTenantId(tenantId),
      namespace: `adaptive-lattice-${tenantId}`,
    }).then((engine) => {
      if (!active) return;
      setOrchestrator(engine);
    });
    return () => {
      active = false;
    };
  }, [tenantId]);

  const blueprintIndex = useMemo(() => {
    const map = new Map<string, LatticeBlueprintManifest>();
    for (const blueprint of initialBlueprints) {
      map.set(parseId(blueprint), blueprint);
    }
    return map;
  }, [initialBlueprints]);

  useEffect(() => {
    const first = blueprintIndex.keys().next();
    if (selectedBlueprintId.length > 0) return;
    const next = first.value;
    if (next) {
      setSelectedBlueprintId(next);
    }
  }, [blueprintIndex, selectedBlueprintId]);

  const stageSummaries = useMemo(
    () =>
      [...blueprintIndex.values()].map((blueprint) => ({
        id: parseId(blueprint),
        steps: blueprint.steps.length,
        mode,
      })),
    [blueprintIndex, mode],
  );

  const appendLog = useCallback((entry: string): void => {
    setLog((prior) => [...prior, `${new Date().toISOString()} ${entry}`].slice(-80));
  }, []);

  const selectedBlueprint = useMemo(() => {
    if (selectedBlueprintId && blueprintIndex.has(selectedBlueprintId)) {
      return blueprintIndex.get(selectedBlueprintId)!;
    }
    return fallbackBlueprint();
  }, [blueprintIndex, selectedBlueprintId]);

  const run = useCallback(async () => {
    if (!orchestrator) {
      appendLog('orchestrator:not-ready');
      return;
    }

    const request: LatticeOrchestratorRequest = {
      tenantId: createPlanContext(selectedBlueprint.tenantId).tenantId,
      routeId: asRouteId(asStringValue(routeId, buildRouteId(tenantId, mode))),
      mode,
      blueprint: selectedBlueprint,
      payload: {
        mode,
        routeId,
      },
    };

    setRunning(true);
    appendLog(`run:start:${selectedBlueprint.name}:${mode}`);

    try {
      const result = await orchestrator.run(request);
      setTrace(result.trace);
      appendLog(`run:complete:${result.status}`);
      await withLatticeSession(makeSessionConfig(selectedBlueprint.tenantId), async () => {
        return Promise.resolve('ok');
      });
      const dryRun = await runPlannerDryRun(selectedBlueprint, request.payload, mode);
      appendLog(`dry-run:diagnostics:${dryRun[0]?.diagnostics.length ?? 0}`);
    } catch (error) {
      appendLog(`run:error:${String((error as LatticeOrchestratorResult | undefined)?.routeId ?? error)}`);
    } finally {
      setRunning(false);
    }
  }, [appendLog, mode, orchestrator, routeId, selectedBlueprint, tenantId]);

  const stop = useCallback(async () => {
    const request = orchestrator ? await orchestrator.stop(asRouteId(routeId)) : false;
    appendLog(`stop:${request ? 'ok' : 'noop'}`);
    setRunning(false);
  }, [appendLog, orchestrator, routeId]);

  const setBlueprintById = useCallback((blueprintId: string) => {
    if (blueprintIndex.has(blueprintId)) {
      setSelectedBlueprintId(blueprintId);
    }
  }, [blueprintIndex]);

  return {
    state: {
      blueprints: [...blueprintIndex.values()],
      selectedBlueprintId,
      mode,
      routeId,
      trace,
      running,
      log,
      stageSummaries,
    },
    setMode,
    setBlueprintById,
    setRouteId,
    run,
    stop,
  } as const;
};
