import {
  InMemoryStreamingDashboardRepository,
  InMemoryStreamingDashboardRepository as MemoryDashboardRepository,
  queryDashboardSnapshots,
} from '@data/streaming-dashboard-store';
import { runOrchestration, OrchestrationInput, StreamTopologyPlan } from './orchestrator';
import { buildHealthSummary, HealthSummary, summarizeSignalDensity } from './health-service';
import { buildSchedule, runSchedule, TenantDashboardCursor, SimulationTask } from './scheduler';
import { StreamHealthSignal } from '@domain/streaming-observability';

export interface DashboardFacadeResult {
  plan: StreamTopologyPlan;
  summary: HealthSummary;
}

export class StreamingDashboardFacade {
  private readonly repository: InMemoryStreamingDashboardRepository;

  constructor(
    repository?: InMemoryStreamingDashboardRepository,
  ) {
    this.repository = repository ?? new MemoryDashboardRepository();
  }

  public async run(input: OrchestrationInput): Promise<DashboardFacadeResult> {
    const planResult = await runOrchestration(input, this.repository);
    if (!planResult.ok) {
      throw planResult.error;
    }
    const summary = await buildHealthSummary(this.repository, input.tenant);
    return { plan: planResult.value, summary };
  }

  public async queryByStream(streamId: string) {
    return queryDashboardSnapshots(this.repository, { streamId });
  }

  public async summarizeSignalDensity(signals: readonly StreamHealthSignal[]): Promise<number> {
    return summarizeSignalDensity(signals);
  }

  public async planSimulation(tenant: string, streamIds: readonly string[]): Promise<SimulationTask[]> {
    return buildSchedule(tenant, streamIds);
  }

  public async runSimulation(tenant: string, streamIds: readonly string[]): Promise<TenantDashboardCursor[]> {
    const tasks = await this.planSimulation(tenant, streamIds);
    const plans = await runSchedule(tasks);
    const snapshots = await queryDashboardSnapshots(this.repository, { tenant });
    const cursor = String(plans.length + snapshots.total);
    return [{ tenant, cursor }] as TenantDashboardCursor[];
  }
}
