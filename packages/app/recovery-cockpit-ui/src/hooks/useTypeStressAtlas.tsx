import { useCallback, useMemo, useState } from 'react';
import {
  buildAtlasIndex,
  runAtlasPipeline,
  parseAtlasRoute,
  toAtlasRoute,
  atlasManifest,
  type AtlasChain,
  type AtlasRegistryInput,
  type AtlasRoute,
  type AtlasSession,
  type AtlasEnvelope,
} from '@shared/type-level-hub';
import { useRecoveryStressWorkbench } from './useRecoveryStressWorkbench';
import { NoInfer, Brand } from '@shared/type-level/patterns';

type AtlasTemplate = `/${string}/${string}/${string}`;

export type AtlasTraceEvent =
  | { readonly kind: 'route'; readonly route: AtlasRoute; readonly template: AtlasTemplate }
  | { readonly kind: 'dispatch'; readonly ok: boolean; readonly resultLength: number }
  | { readonly kind: 'status'; readonly mode: AtlasMode };

export type AtlasAction = 'bootstrap' | 'simulate' | 'stabilize' | 'rollback' | 'snapshot';

export type AtlasMode = 'idle' | 'warming' | 'running' | 'review' | 'failed';

export type AtlasDispatchResult = {
  readonly ok: boolean;
  readonly chainLength: number;
  readonly routed: number;
};

const atlasSeeds = [
  '/atlas/bootstrap/global/seed',
  '/atlas/simulate/global/forecast',
  '/atlas/stabilize/global/region-a',
  '/atlas/rollback/global/incident-01',
  '/atlas/snapshot/global/point-in-time',
] as const satisfies readonly AtlasRoute[];

const inferTemplate = (route: AtlasRoute): AtlasTemplate => {
  const parsed = parseAtlasRoute(route);
  return `/${parsed.tenant}/${parsed.action}/${parsed.target}` as AtlasTemplate;
};

const toRecord = (route: AtlasRoute): AtlasRegistryInput => {
  const parsed = parseAtlasRoute(route);
  return {
    tenant: parsed.tenant,
    action: parsed.action as AtlasAction,
    target: parsed.target,
    confidence: route.length,
  };
};

const seedRecord = atlasSeeds.map((route) => toRecord(route));

export const useTypeStressAtlas = () => {
  const { trend } = useRecoveryStressWorkbench('atlas-workbench');
  const [mode, setMode] = useState<AtlasMode>('idle');
  const [activeRoute, setActiveRoute] = useState<AtlasRoute>(atlasSeeds[0]);
  const [selectedTenant, setSelectedTenant] = useState('global');
  const [history, setHistory] = useState<readonly AtlasTraceEvent[]>([]);

  const sessions = useMemo(() => {
    const base: AtlasRegistryInput[] = [...seedRecord, ...atlasSeeds.map(toRecord)];
    base.push({
      tenant: selectedTenant,
      action: 'bootstrap',
      target: `tenant-${selectedTenant}`,
      confidence: 42,
    });
    return base;
  }, [selectedTenant]);

  const index = useMemo(() => buildAtlasIndex(sessions), [sessions]);

  const filtered = useMemo(
    () =>
      sessions
        .filter((entry) => entry.tenant === selectedTenant || selectedTenant === 'global')
        .map((entry) => ({
          tenant: entry.tenant,
          route: toAtlasRoute(entry),
          confidence: entry.confidence,
        })),
    [sessions, selectedTenant],
  );

  const templateMap = useMemo(
    () =>
      atlasSeeds.reduce<Record<AtlasRoute, AtlasTemplate>>((acc, route) => {
        acc[route] = inferTemplate(route);
        return acc;
      }, {} as Record<AtlasRoute, AtlasTemplate>),
    [],
  );

  const session: AtlasSession<AtlasRegistryInput> = useMemo(
    () => ({
      id: 'atlas-session-0' as Brand<string, 'AtlasSession'>,
      state: mode === 'running' ? 'running' : 'idle',
      tags: ['atlas', 'stress'],
    }),
    [mode],
  );

  const dispatch = useCallback(
    async (payload: NoInfer<AtlasRegistryInput>): Promise<AtlasDispatchResult> => {
      setMode('warming');
      const route = toAtlasRoute(payload);
      const template = inferTemplate(route);
      const running = activeRoute;
      setHistory((current) => [
        ...current,
        { kind: 'route', route, template },
        { kind: 'status', mode: session.state === 'running' ? 'running' : 'idle' },
      ]);
      void running;

      try {
        const chain = await runAtlasPipeline(sessions);
        const envelope = atlasManifest(payload);
        setMode('review');
        setHistory((current) => [
          ...current,
          {
            kind: 'dispatch',
            ok: true,
            resultLength: Object.keys(chain).length,
          },
          { kind: 'status', mode: 'review' },
        ]);
        return {
          ok: true,
          chainLength: (chain as AtlasChain<typeof sessions>).length,
          routed: filtered.length,
        };
      } catch {
        setMode('failed');
        setHistory((current) => [
          ...current,
          { kind: 'dispatch', ok: false, resultLength: 0 },
          { kind: 'status', mode: 'failed' },
        ]);
        return {
          ok: false,
          chainLength: 0,
          routed: filtered.length,
        };
      }
    },
    [sessions, selectedTenant, filtered.length, session.state],
  );

  const bootstrap = useCallback(async () => {
    setMode('running');
    await Promise.all(sessions.map((entry) => dispatch(entry)));
    setMode('review');
  }, [dispatch, sessions]);

  const status = useMemo(() => {
    if (mode === 'failed') {
      return 'Pipeline failed';
    }
    if (mode === 'warming') {
      return 'Preparing route contexts';
    }
    if (mode === 'running') {
      return 'Running atlas pipeline';
    }
    if (mode === 'review') {
      return `Reviewing ${filtered.length} candidates`;
    }
    return 'Idle';
  }, [filtered.length, mode]);

  const baseline = useMemo(
    () => trend.toString().split('').map((value) => value.charCodeAt(0)).reduce((acc, value) => acc + value, 0) + filtered.length,
    [trend, filtered.length],
  );

  return {
    mode,
    status,
    selectedTenant,
    setSelectedTenant,
    activeRoute,
    setActiveRoute,
    sessions,
    filtered,
    index,
    templateMap,
    history,
    session,
    bootstrap,
    dispatch,
    baseline,
    atlasManifest,
    trend,
  };
};

export const buildAtlasRoute = (entry: AtlasRegistryInput): AtlasRoute => toAtlasRoute(entry);
