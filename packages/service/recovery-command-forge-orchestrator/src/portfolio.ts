import { withBrand } from '@shared/core';
import type { ForgeWorkspace, ForgeWorkspaceFilters, ForgeWorkspaceId } from './types';
import type { ForgeOrchestrationBatch, ForgeRunResult, ForgeScenarioWorkspace } from './engine';
import { buildOrchestratedBatch, runWorkspace, buildBatchSummary, summarizeBatch } from './engine';
import type { ForgeScenario } from '@domain/recovery-command-forge';

const buildWorkspaceId = (tenant: string): ForgeWorkspaceId =>
  withBrand(`workspace-${tenant}`, 'RecoveryForgeWorkspaceId');

const toEnvelope = (tenant: string, runs: readonly ForgeRunResult[]) =>
  runs.map((run) => ({
    runId: run.runId,
    tenant,
    budgetWindowMinutes: run.budgetWindowMinutes,
    summary: run.summary,
    policyScore: run.policyScore,
    constraintCount: run.constraints,
  }));

const buildWorkspaceSummary = (
  tenant: string,
  groups: readonly ForgeScenarioWorkspace[],
): Omit<ForgeWorkspace['summary'], 'totalRuns'> => {
  const summary = summarizeBatch({ tenant, generatedAt: new Date().toISOString(), groups });
  return {
    successfulRuns: summary.successfulRuns,
    failedRuns: summary.failedRuns,
    averagePolicyScore: summary.averagePolicyScore,
  };
};

export const buildWorkspaceFromScenarios = (
  tenant: string,
  scenarioSpaces: readonly ForgeScenarioWorkspace[],
): ForgeWorkspace => {
  const allRuns = scenarioSpaces.flatMap((space) => space.runs);
  return {
    workspaceId: buildWorkspaceId(tenant),
    tenant,
    summary: {
      totalRuns: allRuns.length,
      ...buildWorkspaceSummary(tenant, scenarioSpaces),
    },
    envelopes: toEnvelope(tenant, allRuns),
    lastUpdatedAt: new Date().toISOString(),
  };
};

export const collectWorkspace = (tenant: string, scenarios: readonly ForgeScenario[]): ForgeWorkspace => {
  const result = runWorkspace(tenant, scenarios, {});
  if (!result.ok) {
    return buildWorkspaceFromScenarios(tenant, buildOrchestratedBatch(tenant, scenarios).groups);
  }

  return buildWorkspaceFromScenarios(tenant, result.value.groups);
};

export const collectWorkspaceWithFilters = (
  tenant: string,
  scenarios: readonly ForgeScenario[],
  filters: ForgeWorkspaceFilters,
): ForgeWorkspace => {
  const workspace = collectWorkspace(tenant, scenarios);
  const filtered = workspace.envelopes.filter((envelope) => {
    if (filters.tenant && envelope.tenant !== filters.tenant) {
      return false;
    }
    if (filters.minPolicyScore > 0 && envelope.policyScore < filters.minPolicyScore) {
      return false;
    }
    if (filters.onlyBlocked && envelope.constraintCount === 0) {
      return false;
    }
    return true;
  });

  return {
    ...workspace,
    summary: {
      totalRuns: filtered.length,
      successfulRuns: filtered.filter((entry) => entry.policyScore > 50).length,
      failedRuns: filtered.filter((entry) => entry.policyScore <= 50).length,
      averagePolicyScore: filtered.length
        ? Math.round(filtered.reduce((acc, entry) => acc + entry.policyScore, 0) / filtered.length)
        : 0,
    },
    envelopes: filtered,
  };
};
