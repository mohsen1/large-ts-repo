import { Brand } from '@shared/core';
import type { ComplianceBatch } from './compliance';
import type { GovernanceContext, PolicyEnvelope, GovernanceMatrix } from './types';

export interface GovernanceStore {
  saveEnvelope(ctx: GovernanceContext, envelope: PolicyEnvelope): Promise<void>;
  loadEnvelope(ctx: GovernanceContext, envelopeId: Brand<string, 'PolicyEnvelopeId'>): Promise<PolicyEnvelope | null>;
  loadMatrix(ctx: GovernanceContext): Promise<GovernanceMatrix | null>;
  saveCompliance(ctx: GovernanceContext, batch: ComplianceBatch): Promise<void>;
}

export interface GovernanceMemoryState {
  envelopes: Map<string, PolicyEnvelope>;
  matrices: Map<string, GovernanceMatrix>;
  compliance: Map<string, ComplianceBatch[]>;
}

export class InMemoryGovernanceStore implements GovernanceStore {
  private readonly state: GovernanceMemoryState;

  constructor() {
    this.state = {
      envelopes: new Map(),
      matrices: new Map(),
      compliance: new Map(),
    };
  }

  async saveEnvelope(ctx: GovernanceContext, envelope: PolicyEnvelope): Promise<void> {
    this.state.envelopes.set(`${ctx.tenantId}:${envelope.id}`, envelope);
  }

  async loadEnvelope(ctx: GovernanceContext, envelopeId: Brand<string, 'PolicyEnvelopeId'>): Promise<PolicyEnvelope | null> {
    return this.state.envelopes.get(`${ctx.tenantId}:${envelopeId}`) ?? null;
  }

  async loadMatrix(ctx: GovernanceContext): Promise<GovernanceMatrix | null> {
    return this.state.matrices.get(ctx.tenantId) ?? null;
  }

  async saveCompliance(ctx: GovernanceContext, batch: ComplianceBatch): Promise<void> {
    const key = `${ctx.tenantId}:${ctx.domain}`;
    const existing = this.state.compliance.get(key) ?? [];
    this.state.compliance.set(key, [batch, ...existing]);
  }
}

export const storeKey = (ctx: GovernanceContext): string => `${ctx.tenantId}:${ctx.domain}:${ctx.region}`;
