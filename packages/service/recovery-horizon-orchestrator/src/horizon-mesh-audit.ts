import { createRepository } from '@data/recovery-horizon-store';
import {
  type HorizonSignal,
  type JsonLike,
  type PluginContract,
  type PluginStage,
  horizonBrand,
  type TimeMs,
} from '@domain/recovery-horizon-engine';
import { type NoInfer } from '@shared/type-level';

interface WindowWindow {
  readonly from: TimeMs;
  readonly to: TimeMs;
}

export interface MeshAuditRecord<TPayload = JsonLike, TKind extends PluginStage = PluginStage> {
  readonly tenantId: string;
  readonly stage: TKind;
  readonly count: number;
  readonly emitted: number;
  readonly at: TimeMs;
  readonly payload: TPayload;
}

export interface MeshAuditReport<TKind extends PluginStage = PluginStage> {
  readonly tenantId: string;
  readonly window: WindowWindow;
  readonly total: number;
  readonly stages: readonly {
    readonly stage: TKind;
    readonly count: number;
    readonly ratio: number;
  }[];
  readonly signatures: readonly string[];
  readonly errors: readonly string[];
}

export type StageMetricTotals = {
  [K in PluginStage]: number;
};

type AuditSummary = { readonly summary: string; readonly ratio: number };

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

const maxRatio = (count: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, count / total));
};

const asWindow = (): WindowWindow => {
  const end = now();
  return {
    from: horizonBrand.fromTime(Math.max(0, Number(end) - 60_000)),
    to: end,
  };
};

const toMetricMap = (counts: StageMetricTotals): Readonly<StageMetricTotals> =>
  counts;

const toAuditMap = (signals: readonly HorizonSignal<PluginStage, JsonLike>[]): StageMetricTotals => {
  const counts = {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  };
  for (const signal of signals) {
    const current = counts[signal.kind as PluginStage] ?? 0;
    counts[signal.kind as PluginStage] = current + 1;
  }
  return counts;
};

const collectStages = (record: StageMetricTotals): readonly { readonly stage: PluginStage; readonly count: number }[] => {
  const out: { stage: PluginStage; count: number }[] = [];
  for (const stage of ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const) {
    const value = record[stage];
    if (value > 0) {
      out.push({ stage, count: value });
    }
  }
  return out;
};

export const collectAuditForWindow = async (
  tenantId: string,
  stageWindow: PluginStage[],
  maxRows = 200,
): Promise<MeshAuditRecord<JsonLike, PluginStage>[]> => {
  const repository = createRepository(tenantId);
  const readResult = await repository.read({
    tenantId,
    stages: [...stageWindow],
    maxRows,
  });
  if (!readResult.ok) {
    return [];
  }

  return readResult.value.items.map<MeshAuditRecord<JsonLike>>((entry) => ({
    tenantId,
    stage: entry.signal.kind as PluginStage,
    count: 1,
    emitted: 1,
    at: entry.updatedAt,
    payload: entry.signal.payload as JsonLike,
  }));
};

export const auditWindow = async (
  tenantId: string,
  windows: PluginStage[][],
  maxRows = 240,
): Promise<MeshAuditReport<PluginStage>> => {
  const window = asWindow();
  const allSignals: HorizonSignal<PluginStage, JsonLike>[] = [];
  const signatures: string[] = [];

  for (const stageWindow of windows) {
    const records = await collectAuditForWindow(tenantId, stageWindow, maxRows);
    signatures.push(`window:${tenantId}:${stageWindow.join('|')}:${records.length}`);
    for (const record of records) {
      const stage = record.stage as PluginStage;
      allSignals.push({
        id: horizonBrand.fromPlanId(`${tenantId}:${stage}:${record.at}:${record.count}`),
        kind: stage,
        payload: record.payload as JsonLike,
        input: {
          version: '1.0.0',
          runId: horizonBrand.fromRunId(`audit:${tenantId}:${stage}:${record.count}`),
          tenantId,
          stage,
          tags: ['audit', stage],
          metadata: {
            stageWindow: stageWindow.join('|'),
            source: 'audit',
          },
        },
        severity: 'low',
        startedAt: horizonBrand.fromDate(new Date(Number(record.at)).toISOString()),
      });
    }
  }

  const totals = toAuditMap(allSignals);
  const stageEntries = collectStages(toMetricMap(totals));
  const totalCount = allSignals.length;
  const entries = stageEntries.map((entry) => ({
    stage: entry.stage,
    count: entry.count,
    ratio: maxRatio(entry.count, totalCount),
  }));

  return {
    tenantId,
    window,
    total: allSignals.length,
    stages: entries,
    signatures,
    errors: allSignals.length ? [] : ['no-signals'],
  };
};

export const auditPlanSummaries = async (
  tenantId: string,
  windowSet: PluginStage[][],
): Promise<{ tenantId: string; reports: readonly MeshAuditReport<PluginStage>[]; overall: { total: number; stages: number } }> => {
  const reports = await Promise.all(windowSet.map((entry) => auditWindow(tenantId, [entry], 150)));
  const total = reports.reduce((acc, report) => acc + report.total, 0);
  return { tenantId, reports, overall: { total, stages: reports.length } };
};

export const auditFromContracts = async (
  tenantId: string,
  contracts: readonly PluginContract<PluginStage, any, JsonLike>[],
): Promise<readonly MeshAuditReport<PluginStage>[]> => {
  const groups = new Map<string, PluginStage[]>();
  for (const contract of contracts) {
    const signature = `${tenantId}:${contract.kind}`;
    const entry = groups.get(signature) ?? [];
    entry.push(contract.kind);
    groups.set(signature, entry);
  }

  const output: MeshAuditReport<PluginStage>[] = [];
  for (const stageWindow of groups.values()) {
    output.push(await auditWindow(tenantId, [stageWindow], 80));
  }
  return output;
};

export const summarizeAudits = (
  reports: readonly MeshAuditReport<PluginStage>[],
): readonly AuditSummary[] =>
  reports
    .filter((entry) => entry.total > 0)
    .map((entry) => ({
      summary: `${entry.tenantId}:${entry.signatures.join(',')}`,
      ratio: entry.stages.length === 0 ? 0 : entry.total / entry.stages.length,
    }));

export const normalizeAuditEntries = (
  reports: readonly MeshAuditReport<PluginStage>[],
): readonly MeshAuditRecord<JsonLike, PluginStage>[] => {
  const signals: MeshAuditRecord<JsonLike, PluginStage>[] = [];
  for (const report of reports) {
    for (const stage of report.stages) {
      signals.push({
        tenantId: report.tenantId,
        stage: stage.stage,
        count: stage.count,
        emitted: stage.count,
        at: now(),
        payload: { ratio: stage.ratio, signature: report.signatures.join('|') },
      });
    }
  }
  return signals;
};

export const bootstrapAuditPlan = async (
  tenantId: string,
  contracts: readonly PluginContract<PluginStage, any, JsonLike>[],
): Promise<{ readonly ok: boolean; readonly summary: string; readonly reportCount: number }> => {
  const reports = await auditFromContracts(tenantId, contracts);
  const values = summarizeAudits(reports);
  const signature = values.map((value) => value.summary).join(',');
  return { ok: signature.length > 0, summary: signature || 'no-reports', reportCount: reports.length };
};
