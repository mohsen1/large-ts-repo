import { reduceAsyncIterable, collectIterable } from '@shared/stress-lab-runtime';
import type { CampaignDiagnostic, CampaignSnapshot, CampaignRunResult, CampaignPlan, CampaignId, TenantId, AutomationStage } from './types';

export type SeverityBand = 'low' | 'medium' | 'high' | 'critical';

export interface DiagnosticDigest {
  readonly total: number;
  readonly byPhase: Record<string, number>;
  readonly byTag: Record<string, number>;
  readonly byPhaseTag: Record<string, number>;
}

export interface SnapshotOverview {
  readonly path: string;
  readonly tenantId: TenantId;
  readonly campaignId: CampaignId;
  readonly stage: AutomationStage;
  readonly count: number;
}

export interface DiagnosticsFingerprint {
  readonly value: string;
  readonly version: 1;
}

const severityByTag = {
  low: ['info', 'trace'],
  medium: ['warn'],
  high: ['error'],
  critical: ['fatal'],
} as const satisfies Record<SeverityBand, readonly string[]>;

const computeScore = (diagnostics: readonly CampaignDiagnostic[]): number => {
  return diagnostics.reduce((score, item) => {
    if (item.tags.includes('critical')) {
      return score + 5;
    }
    if (item.tags.includes('error')) {
      return score + 3;
    }
    if (item.tags.includes('warn')) {
      return score + 1;
    }
    return score;
  }, 0);
};

export const buildDiagnosticDigest = (diagnostics: readonly CampaignDiagnostic[]): DiagnosticDigest => {
  const byPhase = new Map<string, number>();
  const byTag = new Map<string, number>();

  for (const diagnostic of diagnostics) {
    byPhase.set(diagnostic.phase, (byPhase.get(diagnostic.phase) ?? 0) + 1);
    for (const tag of diagnostic.tags) {
      byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
    }
  }

  const byPhaseTag: Record<string, number> = {};
  for (const [phase, _count] of byPhase.entries()) {
    for (const [tag, tcount] of byTag.entries()) {
      byPhaseTag[`${phase}:${tag}`] = tcount;
    }
  }

  return {
    total: diagnostics.length,
    byPhase: Object.fromEntries(byPhase),
    byTag: Object.fromEntries(byTag),
    byPhaseTag,
  };
};

export const classifySeverity = (item: CampaignDiagnostic): SeverityBand => {
  if (item.tags.includes('fatal') || item.tags.includes('critical')) {
    return 'critical';
  }
  if (item.tags.includes('error')) {
    return 'high';
  }
  if (item.tags.includes('warn')) {
    return 'medium';
  }
  return 'low';
};

export const normalizePhase = (phase: string): AutomationStage => {
  if (phase === 'plan' || phase === 'execute' || phase === 'verify' || phase === 'synthesize') {
    return phase;
  }
  return 'ingest';
};

export const toSnapshotOverview = <TPayload>(
  snapshot: CampaignSnapshot<TPayload>,
  tags: readonly string[],
): SnapshotOverview => ({
  path: `${snapshot.tenantId}/${snapshot.campaignId}/${snapshot.stage}`,
  tenantId: snapshot.tenantId,
  campaignId: snapshot.campaignId,
  stage: normalizePhase(snapshot.stage),
  count: tags.length + 1,
});

export const buildDiagnosticsFingerprint = (diagnostics: readonly CampaignDiagnostic[]): DiagnosticsFingerprint => {
  const digest = buildDiagnosticDigest(diagnostics);
  const raw = `${digest.total}|${Object.entries(digest.byPhaseTag)
    .map(([key, count]) => `${key}=${count}`)
    .sort()
    .join(',')}`;

  return {
    value: `${raw.length}:${raw.slice(0, 64)}`,
    version: 1,
  };
};

export const normalizeDiagnostics = <TPayload extends CampaignDiagnostic>(
  diagnostics: readonly TPayload[],
): readonly TPayload[] => {
  const output = diagnostics
    .toSorted((left, right) => {
      const phaseCompare = left.phase.localeCompare(right.phase);
      if (phaseCompare !== 0) {
        return phaseCompare;
      }
      return left.at.localeCompare(right.at);
    })
    .map((entry) => ({ ...entry, id: entry.id }));

  const deduped = new Map<string, TPayload>();
  for (const entry of output) {
    deduped.set(`${entry.id}:${entry.pluginId}`, entry);
  }

  return [...deduped.values()];
};

export const summarizeDiagnostics = (diagnostics: readonly CampaignDiagnostic[]): string => {
  const digest = buildDiagnosticDigest(diagnostics);
  const entries = Object.entries(digest.byPhase).map(([key, count]) => `${key}:${count}`).join(',');
  return `diagnostics ${digest.total} [${entries}]`;
};

export const foldDiagnostics = async (
  events: AsyncIterable<CampaignDiagnostic> | readonly CampaignDiagnostic[],
): Promise<{ readonly digest: DiagnosticDigest; readonly score: number; readonly lines: readonly string[] }> => {
  if (Symbol.asyncIterator in Object(events)) {
    const values = await reduceAsyncIterable(
      events as AsyncIterable<CampaignDiagnostic>,
      [] as CampaignDiagnostic[],
      (accumulator, next) => {
        accumulator.push(next);
        return Promise.resolve(accumulator);
      },
    );
    const digest = buildDiagnosticDigest(values);
    return {
      digest,
      score: computeScore(values),
      lines: collectIterable(values).map((entry) => `${entry.phase} ${entry.source} ${entry.message}`),
    };
  }

  const values = events as CampaignDiagnostic[];
  return {
    digest: buildDiagnosticDigest(values),
    score: computeScore(values),
    lines: values.map((entry) => `${entry.phase} ${entry.source} ${entry.message}`),
  };
};

export const digestByPlan = (plan: CampaignPlan, diagnostics: readonly CampaignDiagnostic[]): Record<string, string[]> => {
  const byPhase: Record<string, string[]> = {
    ingest: [],
    plan: [],
    execute: [],
    verify: [],
    synthesize: [],
  };

  for (const diagnostic of diagnostics) {
    const key = diagnostic.phase as keyof typeof byPhase;
    byPhase[key].push(classifySeverity(diagnostic));
  }

  const lines: Record<string, string[]> = {};
  for (const phase of Object.keys(byPhase) as Array<keyof typeof byPhase>) {
    lines[`${String(phase)}:${plan.planId}`] = [...byPhase[phase]];
  }

  return lines;
};
