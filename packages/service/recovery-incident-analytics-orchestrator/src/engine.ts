import type { SignalBundle } from './types';
import { RecoveryCommandCenter, RecoveryIncidentOrchestrator } from '@service/recovery-incident-orchestrator';
import type { IncidentId } from '@domain/recovery-incident-orchestration';
import type { SignalRiskProfile, SignalEnvelope } from '@domain/incident-signal-intelligence';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import type { SignalRepository } from '@data/incident-signal-store';
import {
  type IncidentSignalAnalyticsInput,
  type IncidentAnalyticsSnapshot,
  synthesizeAnalyticsSnapshot,
  aggregateSignalProfiles,
  parseAnalyticsInput,
} from '@domain/recovery-incident-analytics';
import { ok, fail, type Result } from '@shared/result';
import { buildAlerts, buildForecastFromProfiles } from './adapters';
import type { AnalyticsDependencies, AnalyticsOrchestratorConfig, AnalyticsEvaluation, AnalyticsResult } from './types';
import { withBrand } from '@shared/core';

export interface AnalyticsEngineContext {
  readonly config: AnalyticsOrchestratorConfig;
  readonly dependencies: AnalyticsDependencies;
}

export class RecoveryIncidentAnalyticsOrchestrator {
  private readonly commandCenter: RecoveryCommandCenter;
  private readonly incidentOrchestrator: RecoveryIncidentOrchestrator;

  constructor(private readonly context: AnalyticsEngineContext) {
    this.incidentOrchestrator = new RecoveryIncidentOrchestrator({ repo: context.dependencies.incidentRepo });
    this.commandCenter = new RecoveryCommandCenter({
      repository: context.dependencies.incidentRepo,
      orchestrator: this.incidentOrchestrator,
    });
  }

  private async readSignals(tenantId: string): Promise<readonly SignalBundle[]> {
    const brandedTenant = withBrand(tenantId, 'TenantId');
    const filter = { filter: { tenantId: brandedTenant } };
    const rawSignals: readonly SignalEnvelope[] = await this.context.dependencies.signalRepo.query(filter);
    const riskProfiles: readonly SignalRiskProfile[] = await this.context.dependencies.signalRepo.summarizeSignals(
      rawSignals.map((signal) => signal.id),
    );
    const bucketed = aggregateSignalProfiles(
      rawSignals.map((signal) => String(signal.id)),
      riskProfiles,
    );

    return rawSignals
      .filter((signal) => {
        const bucket = bucketed[signal.risk as keyof typeof bucketed];
        return signal.id !== undefined && Boolean(bucket?.length);
      })
      .map((signal) => {
        const profile = riskProfiles.find((item) => item.signalId === signal.id) as SignalRiskProfile | undefined;
        return profile ? ({ signal, profile } as SignalBundle) : undefined;
      })
      .filter((entry): entry is SignalBundle => Boolean(entry));
  }

  private async findActiveIncident(tenantId: string): Promise<IncidentId | undefined> {
    const incidents = await this.context.dependencies.incidentRepo.findIncidents({
      tenantId: withBrand(tenantId, 'TenantId'),
    });
    const first = incidents.data.at(0);
    return first ? first.id : undefined;
  }

  async refresh(): Promise<AnalyticsResult<AnalyticsEvaluation>> {
    try {
      const parsed = parseAnalyticsInput({
        tenantId: this.context.config.tenantId,
        signalIds: [],
        horizonMinutes: this.context.config.horizonMinutes,
        lookbackMinutes: this.context.config.lookbackMinutes,
        minConfidence: this.context.config.minConfidence,
        modes: [this.context.config.mode === 'incident' ? 'incident' : 'monitor'],
      });

      const records = await this.readSignals(String(parsed.tenantId));
      const input: IncidentSignalAnalyticsInput = {
        tenantId: parsed.tenantId as any,
        signalIds: records.map((entry) => entry.signal.id),
        horizonMinutes: parsed.horizonMinutes,
        lookbackMinutes: parsed.lookbackMinutes,
        minConfidence: parsed.minConfidence,
        modes: parsed.modes,
      };
      const snapshot: IncidentAnalyticsSnapshot = synthesizeAnalyticsSnapshot(
        input,
        records.map((entry) => entry.profile),
        records.map((entry) => entry.signal),
      );
      const incidentId = await this.findActiveIncident(parsed.tenantId as unknown as string);

      if (incidentId) {
        const alerts = buildAlerts(incidentId as unknown as string, records.map((entry) => entry.profile));
        const forecast = buildForecastFromProfiles(incidentId as unknown as string, records.map((entry) => entry.profile)).map(
          (entry) => ({
            incidentId,
            message: `expected ${entry.runsExpected} runs`,
          }),
        );
        if (this.context.config.mode === 'incident') {
          await this.commandCenter.execute({
            tenantId: parsed.tenantId as unknown as string,
            correlationId: `analytics-${incidentId}`,
            incidentId,
            command: 'plan',
          } as any);
        }
        return ok({
          snapshot,
          forecastWindows: snapshot.forecast,
          recommendations: snapshot.matrix.recommendations,
        });
      }

      return ok({
        snapshot,
        forecastWindows: snapshot.forecast,
        recommendations: snapshot.matrix.recommendations,
      });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('analytics refresh failed'));
    }
  }

  async runForIncident(incidentId: IncidentId): Promise<AnalyticsResult<{ executed: boolean }>> {
    const commandResult = await this.commandCenter.execute({
      tenantId: this.context.config.tenantId,
      incidentId,
      correlationId: `incident-run:${incidentId}:${Date.now()}`,
      command: 'refresh',
    });
    if (commandResult.status === 'rejected') {
      return fail(new Error(commandResult.message || 'refresh rejected'));
    }
    return ok({ executed: true });
  }

  async listProfiles(): Promise<readonly SignalRiskProfile[]> {
    const signals = await this.context.dependencies.signalRepo.query({
      filter: {
        tenantId: withBrand(this.context.config.tenantId, 'TenantId'),
      },
      limit: 1000,
    });
    return this.context.dependencies.signalRepo.summarizeSignals(signals.map((item) => item.id));
  }
}
