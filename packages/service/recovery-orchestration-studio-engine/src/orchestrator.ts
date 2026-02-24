import type { EngineConfig, EngineResult, EngineTick } from './types';
import type { RecoveryRunbook } from '@domain/recovery-orchestration-design';
import { bootstrapEngine } from './engine';

export type StudioStatus = 'idle' | 'running' | 'finished' | 'error' | 'queued' | 'warming';

export interface StudioSession {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly runbookId: string;
}

export interface StudioRun {
  readonly session: StudioSession;
  readonly status: StudioStatus;
  readonly result?: EngineResult;
}

export interface StudioOrchestratorHandle {
  readonly start: (runbook: RecoveryRunbook, config?: Partial<EngineConfig>) => Promise<StudioRun>;
  readonly status: () => Promise<StudioRun>;
  readonly close: () => void;
}

const sessionFromRunbook = (runbook: RecoveryRunbook): StudioSession => ({
  sessionId: String(runbook.scenarioId),
  startedAt: new Date().toISOString(),
  runbookId: String(runbook.scenarioId),
});

export const createStudioOrchestrator = (config?: Partial<EngineConfig>): StudioOrchestratorHandle => {
  let engine = bootstrapEngine(config);
  let latest: StudioRun | undefined = undefined;

  return {
    start: async (runbook: RecoveryRunbook, nextConfig?: Partial<EngineConfig>) => {
      if (nextConfig) {
        engine = engine.withConfig(nextConfig);
      }
      const iterator = engine.run({ runbook });
      const ticks: EngineTick[] = [];
      let result: EngineResult | undefined = undefined;

      while (true) {
        const next = await iterator.next();
        if (next.done) {
          result = next.value;
          break;
        }
        ticks.push(next.value);
      }

      const session = sessionFromRunbook(runbook);
      const completed: StudioRun = {
        session,
        status: result ? 'finished' : 'error',
        result,
      };
      latest = completed;
      return completed;
    },
    status: async () => {
      if (latest) {
        return latest;
      }
      return {
        session: { sessionId: `idle-${Date.now()}`, startedAt: new Date().toISOString(), runbookId: 'idle' },
        status: 'idle',
      };
    },
    close: () => {
      latest = {
        session: latest?.session ?? {
          sessionId: `closed-${Date.now()}`,
          startedAt: new Date().toISOString(),
          runbookId: 'closed',
        },
        status: 'idle',
        result: latest?.result,
      };
    },
  };
};

export const normalizeStatus = (status: StudioStatus): StudioStatus => status;
