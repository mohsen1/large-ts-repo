import type { RecoverySignal, RunSession, RecoveryOperationsEnvelope } from '@domain/recovery-operations-models';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { withBrand } from '@shared/core';
import { deserialize, serialize, createEnvelope } from '@shared/protocol';
import { ok, fail, type Result } from '@shared/result';
import type { RecoveryOperationsRepository as OperationsRepository } from '@data/recovery-operations-store';
import type { IntelligenceRepository } from '@data/recovery-operations-intelligence-store';
import type { OperationsAnalyticsReport, OperationsAnalyticsWindow, MetricWindowContext } from '@data/recovery-operations-analytics';
import { buildOperationsReport } from '@data/recovery-operations-analytics';
import type { RecoveryOperationsQueuePublisher } from '@infrastructure/recovery-operations-queue';
import { buildProgramTopology, summarizeTopology, type TopologySummary } from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';

export type SignalChannel = 'ingest' | 'route' | 'broadcast' | 'archive';

export interface SignalGatewayConfig {
  readonly tenant: string;
  readonly defaultChannel: SignalChannel;
  readonly replayWindowMinutes: number;
}

export interface SignalGatewayDeps {
  readonly repository: OperationsRepository;
  readonly intelligence: IntelligenceRepository;
  readonly publisher: RecoveryOperationsQueuePublisher;
}

export interface SignalGatewayRecord {
  readonly tenant: string;
  readonly envelope: string;
  readonly emittedAt: string;
  readonly channel: SignalChannel;
}

export interface SignalGatewayMetrics {
  readonly tenant: string;
  readonly totalSignals: number;
  readonly channels: Readonly<Record<SignalChannel, number>>;
  readonly lastThroughputPerMinute: number;
  readonly topology: TopologySummary;
}

interface ReplayWindow {
  readonly from: string;
  readonly to: string;
}

const computeWindow = (minutes: number): ReplayWindow => {
  const to = new Date();
  const from = new Date(to.getTime() - minutes * 60_000);
  return { from: from.toISOString(), to: to.toISOString() };
};

const buildTopologySummary = (signals: readonly RecoverySignal[], run: RunSession): TopologySummary => {
  const program: RecoveryProgram = {
    id: withBrand(`run-topology:${run.runId}`, 'RecoveryProgramId'),
    tenant: withBrand(String(run.id), 'TenantId'),
    service: withBrand('recovery-service', 'ServiceId'),
    name: `topology-${run.runId}`,
    description: 'Runtime-derived topology',
    priority: 'silver',
    mode: 'defensive',
    window: {
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      timezone: 'UTC',
    },
    topology: {
      rootServices: ['platform'],
      fallbackServices: ['backup'],
      immutableDependencies: [],
    },
    constraints: [],
    steps: signals.map((signal, index) => ({
      id: `${signal.id}-${index}`,
      title: signal.source,
      command: `inspect:${signal.id}`,
      timeoutMs: 1000 + index * 250,
      dependencies: index > 0 ? [`${signals[index - 1]?.id}-${index - 1}`] : [],
      requiredApprovals: index % 2,
      tags: ['signal', signal.source],
    })),
    owner: run.ticketId,
    tags: ['signal-gateway'],
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };

  return buildProgramTopology(program).summary;
};

const buildSignalDigest = (signals: readonly RecoverySignal[]): string =>
  signals.slice().sort((left, right) => right.severity - left.severity).slice(0, 3).map((signal) => signal.id).join(',');

export class SignalGateway {
  private readonly records: SignalGatewayRecord[] = [];

  constructor(
    private readonly config: SignalGatewayConfig,
    private readonly deps: SignalGatewayDeps,
  ) {}

  async publishSignal(
    session: RunSession,
    signals: readonly RecoverySignal[],
    channel: SignalChannel = this.config.defaultChannel,
  ): Promise<Result<string, string>> {
    try {
      const report = buildOperationsReport({
        tenant: this.config.tenant,
        signals,
        sessions: [session],
        decisions: [],
        assessments: [],
      });

      const topology = summarizeTopology({
        id: withBrand(`run-topology:${session.runId}`, 'RecoveryProgramId'),
        tenant: withBrand(String(session.id), 'TenantId'),
        service: withBrand('service', 'ServiceId'),
        name: String(session.runId),
        description: 'signal route',
        priority: 'bronze',
        mode: 'preventive',
        window: { from: new Date().toISOString(), to: new Date(Date.now() + 20_000).toISOString(), zone: 'UTC' } as never,
        topology: { rootServices: ['gateway'], fallbackServices: ['archive'], immutableDependencies: [] },
        constraints: [],
        steps: signals.map((signal) => ({
          id: signal.id,
          title: signal.id,
          command: signal.source,
          timeoutMs: 1_000,
          dependencies: [],
          requiredApprovals: 0,
          tags: [signal.source],
        })),
        owner: session.ticketId,
        tags: ['gateway'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const payload = {
        tenant: this.config.tenant,
        runId: String(session.runId),
        payload: {
          digest: buildSignalDigest(signals),
          count: signals.length,
          report,
          topology,
          channel,
        },
        emittedAt: new Date().toISOString(),
      };
      const wrapped = createEnvelope('recovery.operation.signals', payload);
      const serialized = serialize(wrapped);
      const parsed = deserialize<RecoveryOperationsEnvelope<unknown>>(serialized);

      const recoveryPayload: RecoveryOperationsEnvelope<unknown> = {
        eventId: parsed.id,
        tenant: withBrand(this.config.tenant, 'TenantId'),
        payload: payload.payload,
        createdAt: parsed.timestamp,
      };

      await this.deps.publisher.publishPayload(recoveryPayload);
      await this.deps.intelligence.logSignal({
        tenant: withBrand(this.config.tenant, 'TenantId'),
        runId: String(session.runId),
        score: report.signalDensity[0]?.signalCount ?? signals.length,
        signal: signals[0] ?? {
          id: `signal-${Date.now()}`,
          source: 'gateway',
          severity: 1,
          confidence: 0.1,
          detectedAt: new Date().toISOString(),
          details: {},
        },
        consumedAt: new Date().toISOString(),
      });

      this.records.push({ tenant: this.config.tenant, envelope: serialized, emittedAt: new Date().toISOString(), channel });
      return ok(serialized);
    } catch (error) {
      return fail((error as Error).message ?? 'GATEWAY_PUBLISH_FAILED');
    }
  }

  async replaySignals(run: RecoveryRunState, readinessPlan: RecoveryReadinessPlan): Promise<Result<SignalGatewayRecord[], string>> {
    const window = computeWindow(this.config.replayWindowMinutes);
    const snapshots = await this.deps.repository.loadLatestSnapshot(readinessPlan.runId);
    if (!snapshots) {
      return fail('NO_SESSION_SNAPSHOT');
    }

    const signals = snapshots.sessions.flatMap((session) => session.signals);
    const topology = buildTopologySummary(signals, snapshots.sessions[0] ?? ({
      id: withBrand('fallback', 'RunSessionId'),
      runId: run.runId,
      ticketId: withBrand('fallback-ticket', 'RunTicketId'),
      planId: withBrand('fallback-plan', 'RunPlanId'),
      status: 'queued',
      createdAt: window.from,
      updatedAt: window.to,
      constraints: {
        maxParallelism: 1,
        maxRetries: 0,
        timeoutMinutes: 60,
        operatorApprovalRequired: false,
      },
      signals: [],
    } as RunSession));
    const report: OperationsAnalyticsReport = buildOperationsReport({
      tenant: this.config.tenant,
      signals,
      sessions: snapshots.sessions,
      decisions: snapshots.latestDecision ? [snapshots.latestDecision] : [],
      assessments: [],
    });
    void report;

    const envelope: RecoveryOperationsEnvelope<{ channel: SignalChannel; signals: number; topology: TopologySummary; window: ReplayWindow }> = {
      eventId: `${run.runId}-replay`,
      tenant: withBrand(this.config.tenant, 'TenantId'),
      payload: {
        channel: 'route',
        signals: signals.length,
        topology,
        window,
      },
      createdAt: new Date().toISOString(),
    };

    this.records.push({
      tenant: this.config.tenant,
      envelope: JSON.stringify(envelope),
      emittedAt: new Date().toISOString(),
      channel: 'route',
    });

    void topology;
    return ok(this.records);
  }

  collectMetrics(run: RecoveryRunState): Result<SignalGatewayMetrics, string> {
    if (this.records.length === 0) {
      return fail('NO_RECORDS');
    }

    const latest = this.records.at(-1);
    if (!latest) return fail('NO_RECORDS');
    const parsed = deserialize<RecoveryOperationsEnvelope<unknown>>(latest.envelope);
    const topologySummary = buildTopologySummary([], {
      id: withBrand(String(run.runId), 'RunSessionId'),
      runId: run.runId,
      ticketId: withBrand('fallback-ticket', 'RunTicketId'),
      planId: withBrand('fallback-plan', 'RunPlanId'),
      status: 'running',
      createdAt: parsed.timestamp,
      updatedAt: new Date().toISOString(),
      constraints: {
        maxParallelism: 1,
        maxRetries: 1,
        timeoutMinutes: 15,
        operatorApprovalRequired: false,
      },
      signals: [],
    });
    const tenant = withBrand(latest.tenant, 'TenantId');

    const makeWindow = (): OperationsAnalyticsWindow => ({
      tenant,
      window: {
        from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
        zone: 'UTC',
        kind: 'hour',
      },
      sessions: [],
      sessionsByStatus: {
        queued: 0,
        warming: 0,
        running: 0,
        blocked: 0,
        completed: 0,
        failed: 0,
        aborted: 0,
      },
      sessionScoreTrend: {
        direction: 'flat',
        points: [],
      },
    });
    void makeWindow();

    return ok({
      tenant: this.config.tenant,
      totalSignals: this.records.length,
      channels: {
        ingest: this.records.filter((record) => record.channel === 'ingest').length,
        route: this.records.filter((record) => record.channel === 'route').length,
        broadcast: this.records.filter((record) => record.channel === 'broadcast').length,
        archive: this.records.filter((record) => record.channel === 'archive').length,
      },
      lastThroughputPerMinute: this.records.length / Math.max(1, this.config.replayWindowMinutes),
      topology: topologySummary,
    });
  }
}

export const createSignalGateway = (config: SignalGatewayConfig, deps: SignalGatewayDeps): SignalGateway =>
  new SignalGateway(config, deps);
