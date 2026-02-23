import { createRecoveryPlaybookEngine, type OrchestratorDecision } from './readiness-playbook-engine';
import type {
  PlaybookDefinition,
  ReadinessPriority,
  PlaybookSignal,
  ReadinessRun,
} from '@domain/recovery-readiness/playbook-models';

export interface SchedulerInput {
  playbooks: PlaybookDefinition[];
  priority: ReadinessPriority;
  requester: string;
  signals: PlaybookSignal[];
}

export interface SchedulerOutput {
  accepted: Array<{ playbookId: string; decision: OrchestratorDecision }>;
  rejected: Array<{ playbookId: string; reason: string }>;
}

const buildRunId = (playbookId: string): string => `${playbookId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const runReadinessScheduler = async (input: SchedulerInput): Promise<SchedulerOutput> => {
  const engine = createRecoveryPlaybookEngine();

  await engine.bootstrap(input.playbooks);
  const accepted: SchedulerOutput['accepted'] = [];
  const rejected: SchedulerOutput['rejected'] = [];

  for (const playbook of input.playbooks) {
    const candidates = await engine.proposeCandidates({
      playbook,
      triggeringSignals: input.signals,
      requestedBy: input.requester,
      priority: input.priority,
      requestedAt: new Date().toISOString(),
      allowedCategories: [playbook.category],
    });

    const candidate = candidates[0];
    if (!candidate) {
      rejected.push({ playbookId: playbook.id, reason: 'No candidates after policy evaluation' });
      continue;
    }

    const run: ReadinessRun = {
      id: buildRunId(playbook.id),
      playbookId: playbook.id,
      triggeredBy: input.requester,
      status: 'draft',
      priority: input.priority,
      startedAt: new Date().toISOString(),
      riskScore: candidate.result.confidence,
      signals: input.signals,
      execution: [],
      metadata: {
        source: 'recovery-readiness-scheduler',
        candidateMatch: true,
      },
    };

    const decision = await engine.scheduleRun({
      run,
      candidate,
    });

    if (!decision.ok) {
      rejected.push({ playbookId: playbook.id, reason: `Schedule failed: ${decision.error.message}` });
      continue;
    }

    accepted.push({ playbookId: playbook.id, decision: decision.value });
  }

  return { accepted, rejected };
};
