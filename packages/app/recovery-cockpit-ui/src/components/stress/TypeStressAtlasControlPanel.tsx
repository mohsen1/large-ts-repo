import { useCallback, useMemo } from 'react';
import { useTypeStressAtlas } from '../../hooks/useTypeStressAtlas';
import { type AtlasAction, type AtlasMode, type AtlasTraceEvent, type AtlasDispatchResult } from '../../hooks/useTypeStressAtlas';

export type ControlPanelMode = Exclude<AtlasMode, 'failed'> | 'complete' | 'error';

export type ControlResult = {
  readonly ok: boolean;
  readonly routed: number;
  readonly chainLength: number;
  readonly summary: string;
};

type DispatchTemplate = {
  readonly tenant: string;
  readonly action: AtlasAction;
  readonly target: string;
};

const buildTemplate = (tenant: string, action: AtlasAction): DispatchTemplate => ({
  tenant,
  action,
  target: `${action}-${tenant}`,
});

const reduceTemplate = (entry: Readonly<DispatchTemplate>, index: number): string =>
  `${index + 1}:${entry.tenant}@${entry.action}#${entry.target}`;

export type ControlPanelProps = {
  readonly heading: string;
  readonly tenants: readonly string[];
  readonly fallbackAction?: AtlasAction;
  readonly onResult: (result: ControlResult) => void;
};

export const TypeStressAtlasControlPanel = ({
  heading,
  tenants,
  fallbackAction = 'bootstrap',
  onResult,
}: ControlPanelProps) => {
  const { dispatch, session, bootstrap, setSelectedTenant, status, trend } = useTypeStressAtlas();

  const planned = useMemo(
    () => tenants.map((tenant) => buildTemplate(tenant, fallbackAction)),
    [fallbackAction, tenants],
  );

  const mode: ControlPanelMode = session.state === 'error' ? 'error' : session.state;

  const runAll = useCallback(async () => {
    let completed = 0;
    for (const template of planned) {
      await dispatch({
        tenant: template.tenant,
        action: template.action,
        target: template.target,
        confidence: 40 + (template.tenant.length % 10),
      });
      completed += 1;
    }
    return completed;
  }, [dispatch, planned]);

  const runWithTenant = useCallback(
    async (template: DispatchTemplate) => {
      setSelectedTenant(template.tenant);
      const result = await dispatch({
        tenant: template.tenant,
        action: template.action,
        target: template.target,
        confidence: 95,
      });
      onResult({
        ok: result.ok,
        routed: result.routed,
        chainLength: result.chainLength,
        summary: `${template.tenant} -> ${template.action}`,
      });
    },
    [dispatch, onResult, setSelectedTenant],
  );

  const handleBootstrap = useCallback(() => {
    void runAll();
    void bootstrap();
  }, [bootstrap, runAll]);

  const trendScore = useMemo(
    () =>
      trend.toString().length + trend.toString().split('').reduce((acc, char) => acc + char.length, 0),
    [trend],
  );

  return (
    <section style={{ padding: 12, border: '1px solid #7c3aed', borderRadius: 8 }}>
      <h4>{heading}</h4>
      <p>
        mode:
        {' '}
        {mode}
        {' · '}
        status:
        {' '}
        {status}
      </p>
      <p>trend score {trendScore}</p>
      <p>planned count: {planned.length}</p>
      <div style={{ marginBottom: 8 }}>
        <button type="button" onClick={() => void handleBootstrap()}>
          bootstrap all
        </button>
      </div>
      <ul>
        {planned.map((template, index) => {
          const row = reduceTemplate(template, index);
          return (
            <li key={row}>
              <button type="button" onClick={() => void runWithTenant(template)}>
                run
                {' '}
                {row}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export const classifyControlEvent = (event: AtlasTraceEvent): ControlPanelMode => {
  if (event.kind === 'status' && event.mode === 'failed') {
    return 'error';
  }
  if (event.kind === 'dispatch') {
    return event.ok ? 'running' : 'error';
  }
  return 'warming';
};

export const hydrateResults = (result: AtlasDispatchResult): ControlResult => ({
  ok: result.ok,
  routed: result.routed,
  chainLength: result.chainLength,
  summary: `${result.chainLength}:${result.routed}`,
});
