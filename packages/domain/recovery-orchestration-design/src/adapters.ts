import type { DomainPhase, RecoveryRunbook, RecoveryScenarioTemplate, ScenarioEnvelope } from './models';
import { makeScenarioId, makeTenantId, makeWorkspaceId } from './models';
import { normalizeTemplate } from './planner';
import type { ParsedRunbook } from './schema';
import { parseRunbook } from './schema';
import { withBrand } from '@shared/core';

export interface AdapterError {
  readonly code: 'parse' | 'transform' | 'normalize';
  readonly message: string;
}

export interface AdapterResult<T> {
  readonly ok: true;
  readonly value: T;
  readonly warnings: readonly string[];
}

export interface AdapterFailure {
  readonly ok: false;
  readonly error: AdapterError;
}

export type AdapterOutput<T> = AdapterResult<T> | AdapterFailure;

export const adaptRunbook = (raw: unknown, warnings: string[] = []): AdapterOutput<RecoveryRunbook> => {
  try {
    const runbook = parseRunbook(raw);
    return {
      ok: true,
      value: runbook,
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'parse',
        message: error instanceof Error ? error.message : 'unknown-parse',
      },
    };
  }
};

export const adaptTemplate = (raw: ParsedRunbook, warnings: string[] = []): AdapterOutput<ScenarioEnvelope> => {
  if (!raw.nodes.length) {
    return {
      ok: false,
      error: {
        code: 'transform',
        message: 'runbook must include at least one node',
      },
    };
  }
  const edgeReferencesMissingNode = (edge: ParsedRunbook['edges'][number]): boolean =>
    !raw.nodes.some((node: ParsedRunbook['nodes'][number]) => node.id === edge.from) ||
    !raw.nodes.some((node: ParsedRunbook['nodes'][number]) => node.id === edge.to);

  if (raw.edges.some(edgeReferencesMissingNode)) {
    return {
      ok: false,
      error: {
        code: 'normalize',
        message: 'edge references missing node',
      },
    };
  }
  return {
    ok: true,
    value: {
      id: withBrand(`${raw.tenant}.${raw.scenarioId}`, 'LinkToken'),
      scenario: {
        tenantId: makeTenantId(raw.tenant),
        workspaceId: makeWorkspaceId(raw.workspace),
        scenarioId: makeScenarioId(makeTenantId(raw.tenant), raw.scenarioId),
        origin: 'domain-adapter',
        labels: { source: 'recovery-runbook' },
      },
      runbook: raw,
      run: undefined,
    },
    warnings,
  };
};

export const normalizeScenario = <T>(value: T): T & { readonly normalizedAt: string } => ({
  ...(value as T & { readonly normalizedAt?: string }),
  normalizedAt: new Date().toISOString(),
});

export const templateToPhases = <TTemplate extends RecoveryScenarioTemplate<readonly DomainPhase[]>>(
  template: TTemplate,
): readonly DomainPhase[] =>
  normalizeTemplate({
    phases: template.phases,
    tags: ['adapter'],
  policy: {
      code: 'policy:adapted',
      command: 'plan-adapt',
      scope: 'studio',
      requiredCapabilities: [],
      metadata: {},
    },
  }).phases;
