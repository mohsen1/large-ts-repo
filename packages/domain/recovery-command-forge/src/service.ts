import { buildExecutionReport } from './planner';
import { RecoveryCommandForgeAdapter, withDomainRepository } from './adapters';
import { simulateBatch, simulateByBudget, generateDefaultSimulation, summarizeBatch, type SimulationBatch } from './simulation';
import type { ForgeRuntimeConfig, ForgeScenario, ForgeExecutionReport } from './types';

export interface ForgeServiceInput {
  readonly tenant: string;
  readonly scenarios: readonly ForgeScenario[];
  readonly config?: Partial<ForgeRuntimeConfig>;
}

export interface ForgeServiceReport {
  readonly tenant: string;
  readonly topologies: number;
  readonly simulationSummary: string;
  readonly reportIds: readonly string[];
  readonly exportedReports: readonly string[];
}

export interface ForgeServiceRun {
  readonly scenario: ForgeScenario;
  readonly report: ForgeExecutionReport;
  readonly exportEnvelope: ReturnType<RecoveryCommandForgeAdapter['exportReport']>;
}

export class RecoveryCommandForgeService {
  public constructor(private readonly input: ForgeServiceInput) {}

  public run(): ForgeServiceReport {
    const outputs: readonly ForgeServiceRun[] = this.input.scenarios.map((scenario) => {
      const report = buildExecutionReport(this.input.tenant, scenario, this.input.config);
      const adapter = new RecoveryCommandForgeAdapter(this.input.tenant, [scenario]);
      return {
        scenario,
        report,
        exportEnvelope: adapter.exportReport(report),
      };
    });

    const batch: SimulationBatch = outputs.map((entry) => simulateBatch(this.input.tenant, [entry.scenario])).reduce(
      (acc, item) => ({
        tenant: this.input.tenant,
        runCount: acc.runCount + item.runCount,
        bestRiskScore: Math.max(acc.bestRiskScore, item.bestRiskScore),
        worstRiskScore: Math.min(acc.worstRiskScore, item.worstRiskScore),
        runs: [...acc.runs, ...item.runs],
      }),
      { tenant: this.input.tenant, runCount: 0, bestRiskScore: 0, worstRiskScore: Number.POSITIVE_INFINITY, runs: [] } as SimulationBatch,
    );

    const topologies = outputs.reduce((acc, item) => acc + item.report.topologies.length, 0);

    const summary = this.input.scenarios
      .map((scenario) => {
        const sampled = scenario ? simulateByBudget(this.input.tenant, scenario, [30, 60, 90, 120]) : null;
        return sampled ? summarizeBatch(sampled) : `${this.input.tenant}: invalid scenario`;
      })
      .join(' | ');

    return {
      tenant: this.input.tenant,
      topologies,
      simulationSummary: `${summary} | batch=${batch.runCount > 0 ? `${batch.bestRiskScore}` : 'n/a'}`,
      reportIds: outputs
        .flatMap((output) => output.report.topologies.map((topology) => topology.planId))
        .map(String),
      exportedReports: outputs.map((output) => JSON.stringify(output.exportEnvelope)),
    };
  }

  public runOne(index: number): string {
    const scenario = this.input.scenarios[index];
    if (!scenario) {
      return JSON.stringify({ error: 'Scenario not found' });
    }

    const defaultReport = generateDefaultSimulation(this.input.tenant, scenario);
    return summarizeBatch(defaultReport);
  }

  public hydrateScenario() {
    const adapter = withDomainRepository(this.input.tenant, this.input.scenarios);
    return this.input.scenarios.map((scenario) => {
      const report = buildExecutionReport(this.input.tenant, scenario, this.input.config);
      const wire = adapter.exportReport(report);
      return adapter.importReport(wire);
    });
  }
}

export const buildForgeService = (input: ForgeServiceInput): RecoveryCommandForgeService => new RecoveryCommandForgeService(input);
