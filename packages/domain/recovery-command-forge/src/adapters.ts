import { withBrand } from '@shared/core';
import type { ForgeExecutionReport, ForgeScenario, ForgeRuntimeConfig, ForgeGraph } from './types';
import { buildExecutionReport } from './planner';

export interface ForgeExportEnvelope {
  readonly tenant: string;
  readonly generatedAt: string;
  readonly report: ForgeExecutionReport;
}

export interface ForgeImportRecord {
  readonly tenant: string;
  readonly scenario: ForgeScenario;
  readonly report: ForgeExecutionReport;
}

export interface ForgeRuntimeAdapter {
  exportReport(report: ForgeExecutionReport): ForgeExportEnvelope;
  importReport(record: ForgeExportEnvelope): ForgeImportRecord;
  materializePlanGraph(scenario: ForgeScenario, config?: Partial<ForgeRuntimeConfig>): ForgeGraph;
}

export class RecoveryCommandForgeAdapter implements ForgeRuntimeAdapter {
  public constructor(private readonly tenant: string, private readonly scenarios: readonly ForgeScenario[]) {}

  public exportReport(report: ForgeExecutionReport): ForgeExportEnvelope {
    return {
      tenant: this.tenant,
      generatedAt: new Date().toISOString(),
      report,
    };
  }

  public importReport(record: ForgeExportEnvelope): ForgeImportRecord {
    const scenario = this.scenarios.find((entry) => entry.tenant === record.tenant);
    if (!scenario) {
      throw new Error(`Scenario not found for tenant ${record.tenant}`);
    }

    return {
      tenant: record.tenant,
      scenario,
      report: record.report,
    };
  }

  public materializePlanGraph(scenario: ForgeScenario, config: Partial<ForgeRuntimeConfig> = {}): ForgeGraph {
    const report = buildExecutionReport(scenario.tenant, scenario, config);
    const topology = report.topologies[0];

    const nodes = topology?.nodes.map((node) => node.node) ?? [];
    const edges = nodes
      .slice(1)
      .map((node, index) => ({
        from: nodes[index]?.id ?? node.id,
        to: node.id,
        dependencyStrength: 0.4,
        isOptional: index % 2 === 0,
      }));

    return {
      planId: topology?.planId ?? withBrand(`tenant-${scenario.tenant}`, 'RecoveryForgePlanId'),
      tenant: scenario.tenant,
      createdAt: report.generatedAt,
      nodes,
      edges,
    };
  }
}

export const withDomainRepository = (tenant: string, scenarios: readonly ForgeScenario[]): ForgeRuntimeAdapter =>
  new RecoveryCommandForgeAdapter(tenant, scenarios);

export const serializeReport = (report: ForgeExecutionReport): string => JSON.stringify(report);

export const hydrateReport = (payload: string): ForgeExecutionReport => JSON.parse(payload) as ForgeExecutionReport;
