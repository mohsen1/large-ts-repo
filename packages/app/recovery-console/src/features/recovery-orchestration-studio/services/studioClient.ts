import type { EngineConfig, EngineResult } from '@service/recovery-orchestration-studio-engine';
import { bootstrapEngine } from '@service/recovery-orchestration-studio-engine';
import { parseRunbook, type RecoveryRunbook } from '@domain/recovery-orchestration-design';
import type { StudioResultPanel } from '../types';
import { studioDefaultConfig } from '../types';
import { studioConfigToEngine } from '../types';

const fallbackRunbook = {
  tenant: 'acme',
  workspace: 'recovery-playground',
  scenarioId: 'acme-latency-incident',
  title: 'Fallback latency scenario',
  nodes: [
    {
      id: 'discover',
      title: 'Discover scope',
      phase: 'discover',
      severity: 'low',
      status: 'pending',
      metrics: { slo: 0.98, capacity: 0.9, compliance: 0.97, security: 0.95 },
      prerequisites: [],
    },
  ],
  edges: [],
  directives: [{ code: 'policy:default', command: 'noop', scope: 'global', requiredCapabilities: ['read-only'], metadata: {} }],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const engineDefaults = Promise.resolve(studioDefaultConfig)
  .then((defaults) => defaults);

export interface StudioRunRequest {
  readonly runbook?: RecoveryRunbook;
  readonly config?: Partial<EngineConfig>;
}

export interface StudioRunResponse {
  readonly result: EngineResult;
  readonly panel: StudioResultPanel;
}

const resolveRunbook = async (value?: RecoveryRunbook): Promise<RecoveryRunbook> => {
  if (value) {
    return value;
  }
  const parsed = await Promise.resolve(fallbackRunbook)
    .then((raw) => parseRunbook(raw));
  return parsed;
};

const buildPanel = (result: EngineResult, startMs: number): StudioResultPanel => ({
  result,
  elapsedMs: Math.max(0, new Date(result.finishedAt).getTime() - startMs),
  phaseCount: result.ticks.length,
  status: result.ticks.length > 0 ? 'done' : 'error',
});

export const runStudio = async (request: StudioRunRequest): Promise<StudioRunResponse> => {
  const configDefaults = await engineDefaults;
  const engineConfig = studioConfigToEngine(configDefaults);
  const runbook = await resolveRunbook(request.runbook);
  const config: EngineConfig = { ...engineConfig, ...request.config };
  const engine = bootstrapEngine({ ...config });
  const started = Date.now();
  const iterator = engine.run({ runbook });
  const ticks = [];
  for await (const tick of iterator) {
    ticks.push(tick);
    if (tick.phase === 'complete') {
      break;
    }
  }
  const result: EngineResult = {
    executionId: `${runbook.scenarioId}::${started}` as any,
    tenant: config.tenant,
    workspace: config.workspace,
    ticks,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
  };
  return { result, panel: buildPanel(result, started) };
};
