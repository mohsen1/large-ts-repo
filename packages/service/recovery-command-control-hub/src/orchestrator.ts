import { ok, fail, type Result } from '@shared/result';
import {
  buildDraftInsights,
  buildExecution,
  makeDraft,
  withDependency,
  type HubDraftInput,
  type HubExecution,
  type HubRunId,
  type HubSummary,
  buildRiskEnvelope,
  scoreExecution,
} from '@domain/recovery-command-control-hub';
import { closeWindow, createControlWindow, isWindowOpen } from '@domain/recovery-command-control-hub';
import { publishExecution, ConsoleRuntimePublisher, InMemoryCommandHubRepository, type CommandHubRepository, type RuntimePublisher } from './adapters';

export interface OrchestratorInput {
  readonly tenantId: string;
  readonly commands: readonly HubDraftInput[];
  readonly repository?: CommandHubRepository;
  readonly publisher?: RuntimePublisher;
}

export interface OrchestrationOutput {
  readonly runId: HubRunId;
  readonly execution: HubExecution;
  readonly summary: HubSummary;
  readonly score: number;
  readonly posture: ReturnType<typeof buildRiskEnvelope>['posture'];
  readonly windowOpen: boolean;
  readonly recommendations: readonly string[];
}

export interface OrchestratorError {
  readonly code: 'not-run' | 'publish-failed';
  readonly message: string;
}

export class CommandControlHubOrchestrator {
  constructor(
    private readonly repository: CommandHubRepository = new InMemoryCommandHubRepository(),
    private readonly publisher: RuntimePublisher = new ConsoleRuntimePublisher(),
  ) {}

  async start(input: OrchestratorInput): Promise<Result<OrchestrationOutput, OrchestratorError>> {
    try {
      const plan = makeDraft({ tenantId: input.tenantId, nodes: input.commands });
      const seeded =
        plan.order.length >= 2 && plan.order[0] && plan.order[1]
          ? withDependency(plan.draft, plan.order[0].id, plan.order[1].id, 'default planning edge')
          : plan.draft;

      const execution = buildExecution({ ...plan, draft: seeded });
      const risk = buildRiskEnvelope(execution);
      const score = scoreExecution(execution);
      const insights = buildDraftInsights(plan.summary);

      const controlWindow = createControlWindow(execution.run.runId, new Date().toISOString(), 90);
      const windowOpen = isWindowOpen(controlWindow);
      const finalWindow = windowOpen ? controlWindow : closeWindow(controlWindow);

      const finalExecution: HubExecution = {
        ...execution,
        controlWindow: finalWindow,
      };

      await this.repository.saveExecution(finalExecution);
      await publishExecution(this.publisher, `hub.execution.${input.tenantId}`, finalExecution);

      return ok({
        runId: finalExecution.run.runId,
        execution: finalExecution,
        summary: plan.summary,
        score,
        posture: risk.posture,
        windowOpen,
        recommendations: [...risk.recommendations, insights.action],
      });
    } catch (error) {
      return fail({ code: 'publish-failed', message: String(error) });
    }
  }

  async startForTenant(tenantId: string, commands: readonly HubDraftInput[]): Promise<OrchestrationOutput> {
    const result = await this.start({ tenantId, commands });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }
}

export const runHubOrchestrator = async (
  input: OrchestratorInput,
): Promise<Result<OrchestrationOutput, OrchestratorError>> => {
  const orchestrator = new CommandControlHubOrchestrator(input.repository, input.publisher);
  return orchestrator.start(input);
};
