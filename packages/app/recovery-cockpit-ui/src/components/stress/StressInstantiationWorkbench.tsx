import { type FC, useMemo } from 'react';
import {
  type RunPipeline,
  type WorkDomain,
  type WorkFactoryItem,
  type WorkMode,
  type WorkOutput,
  type WorkPayload,
  type WorkVerb,
  buildFactoryMatrix,
  createPipelineRunner,
  defineWorkFactories,
  registerWorkloadPipeline,
} from '@shared/type-level';
import { warmRouteCatalog } from '../../services/recoveryCockpitStressWorkloadService';

type WorkSpecPayload = WorkPayload<WorkDomain, WorkVerb, WorkMode>;
type WorkTupleReturn = ReturnType<typeof defineWorkFactories>;
type WorkBenchProps = {
  readonly compact?: boolean;
};

type WorkProfile = {
  readonly label: string;
  readonly result: WorkOutput<WorkDomain, WorkVerb, WorkMode>;
};

type SeedOutput = Pick<WorkOutput<WorkDomain, WorkVerb, WorkMode>, 'status' | 'score' | 'channel'>;

const makePayload = (
  verb: WorkVerb,
  route: string,
  mode: WorkMode,
  active: boolean,
): WorkSpecPayload => ({
  domain: 'agent',
  verb,
  mode,
  weight: 77,
  label: `agent:${verb}:${mode}:${route}`,
  context: {
    mode,
    active,
    marker: `/agent/${verb}/${mode}/agent`,
  },
});

const makeOutput = (payload: WorkSpecPayload, output: SeedOutput): WorkOutput<WorkDomain, WorkVerb, WorkMode> => ({
  ...payload,
  status: output.status,
  score: output.score,
  channel: output.channel,
  input: payload,
});

const normalizeFactory = (value: WorkTupleReturn): readonly WorkFactoryItem[] => {
  return Array.isArray(value) ? [...value] : [value];
};

const instantiateExamples = () => {
  const a = defineWorkFactories('agent', 'align', makePayload('align', 'agent-align-1', 'warm', false));
  const b = defineWorkFactories('agent', 'triage', makePayload('triage', 'agent-triage-2', 'emergency', true));
  const c = defineWorkFactories('agent', 'restore', makePayload('restore', 'agent-restore-3', 'cold', true));
  const dPayload = makePayload('scale', 'agent-scale-4', 'hot', false);
  const d = defineWorkFactories(
    'agent',
    'scale',
    dPayload,
    makeOutput(dPayload, {
      status: 'warn',
      score: 34,
      channel: 'w-agent/scale/hot',
    }),
  );
  const e = defineWorkFactories('agent', 'simulate', makePayload('simulate', 'agent-simulate-5', 'warm', true), undefined);
  const f = defineWorkFactories({
    domain: 'agent',
    verb: 'snapshot',
    mode: 'maintenance',
  });
  const triagePayload = makePayload('triage', 'agent-3', 'maintenance', true);
  const g = defineWorkFactories(
    { domain: 'agent', verb: 'restore', mode: 'cold' } as const,
    { domain: 'agent', verb: 'stabilize', mode: 'hot' } as const,
    {
      domain: 'agent',
      verb: 'triage',
      mode: 'maintenance',
      input: triagePayload,
      output: makeOutput(triagePayload, {
        status: 'ok',
        score: 80,
        channel: 'w-agent/triage/maintenance',
      }),
    },
  );
  const out: WorkFactoryItem[] = [];
  if (Array.isArray(a)) {
    out.push(...a);
  } else {
    out.push(a);
  }
  if (Array.isArray(b)) {
    out.push(...b);
  } else {
    out.push(b);
  }
  if (Array.isArray(c)) {
    out.push(...c);
  } else {
    out.push(c);
  }
  if (Array.isArray(d)) {
    out.push(...d);
  } else {
    out.push(d);
  }
  if (Array.isArray(e)) {
    out.push(...e);
  } else {
    out.push(e);
  }
  if (Array.isArray(f)) {
    out.push(...f);
  } else {
    out.push(f);
  }
  if (Array.isArray(g)) {
    out.push(...g);
  } else {
    out.push(g);
  }
  return out;
};

const buildRows = (instances: readonly WorkFactoryItem[]) => {
  const flat = instances;
  return flat.map((spec, index) => {
    const verb = index % 2 === 0 ? 'activate' : 'restore';
    const payload = makePayload(
      verb,
      `agent-${verb}-${index}`,
      index % 2 === 0 ? 'hot' : 'cold',
      index % 3 === 0,
    );
    return {
      specIndex: index,
      domain: spec.domain,
      mode: (index % 2 === 0 ? 'hot' : 'cold') as WorkMode,
      output: makeOutput(payload, {
        status: index % 3 === 0 ? 'warn' : 'ok',
        score: 20 + index,
        channel: `w-agent/${verb}/${index % 2 === 0 ? 'hot' : 'cold'}`,
      }),
      active: index % 2 === 0,
    };
  });
};

const buildCatalog = () => {
  const alignPayload = makePayload('align', 'agent-align', 'hot', true);
  const meshPayload = makePayload('route', 'mesh-route', 'warm', true);
  const controlPayload = makePayload('deploy', 'control-deploy', 'cold', false);
  const alignFactory = defineWorkFactories('agent', 'align', alignPayload, makeOutput(alignPayload, {
    status: 'ok',
    score: 70,
    channel: 'w-agent/align/hot',
  }));
  const meshFactory = defineWorkFactories('mesh', 'route', {
    ...meshPayload,
    domain: 'mesh',
  }, makeOutput(meshPayload, {
    status: 'ok',
    score: 60,
    channel: 'w-mesh/route/warm',
  }));
  const controlFactory = defineWorkFactories('control', 'deploy', {
    ...controlPayload,
    domain: 'control',
  }, makeOutput(controlPayload, {
    status: 'warn',
    score: 30,
    channel: 'w-control/deploy/cold',
  }));
  const specs = [alignFactory, meshFactory, controlFactory] as const;
  return registerWorkloadPipeline(...specs);
};

export const StressInstantiationWorkbench: FC<WorkBenchProps> = ({ compact = false }) => {
  const instances = useMemo(() => instantiateExamples(), []);
  const rows = useMemo(() => buildRows(instances), [instances]);
  const catalog = useMemo(() => buildCatalog(), []);
  const matrix = catalog.matrix;

  const runner = useMemo<RunPipeline<typeof catalog.specs>>(
    () => createPipelineRunner(catalog.specs as typeof catalog.specs),
    [catalog.specs],
  );

  const runProfiles = useMemo<WorkProfile[]>(() => {
    const out: WorkProfile[] = [];
    for (const [index, row] of rows.entries()) {
      const safeIndex = Math.min(index, catalog.specs.length - 1);
      const result = runner.run(safeIndex, row.output.input);
      out.push({
        label: `${row.domain}:${row.mode}:${row.specIndex}`,
        result,
      });
    }
    return out;
  }, [rows, runner, catalog.specs.length]);

  const matrixValues = Object.entries(matrix as Record<string, { key: string; spec: WorkFactoryItem }>);
  const compactMode = compact ? 'narrow' : 'wide';

  return (
    <section style={{ border: '1px solid #34405f', borderRadius: 12, padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Instantiation workload</h3>
        <small>{compactMode}</small>
      </header>
      <p style={{ fontSize: 12 }}>routes={warmRouteCatalog.length}</p>
      <div style={{ marginBottom: 8, display: 'grid', gap: 8, fontSize: 12 }}>
        {runProfiles.slice(0, compact ? 4 : 12).map((profile) => (
          <article key={profile.label}>
            <div>{profile.label}</div>
            <div>
              score={profile.result.score}
              {' '}
              channel={profile.result.channel}
              {' '}
              status={profile.result.status}
            </div>
          </article>
        ))}
      </div>
      <div>
        <strong>Matrix</strong>
        <ol>
          {matrixValues.slice(0, 5).map(([key, value], index) => (
            <li key={`${key}-${index}`}>
              {String(key)}:{String(Object.keys(value).length)}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
