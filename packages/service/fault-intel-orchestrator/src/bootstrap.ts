import { asTenantId, asWorkspaceId } from '@domain/fault-intel-orchestration';
import type { CampaignTemplateOptions, CampaignTemplateRequest, NoInfer, PhaseType } from '@domain/fault-intel-orchestration';

export interface BuiltinTemplate {
  readonly name: string;
  readonly config: CampaignTemplateRequest<readonly PhaseType[]>;
  readonly options: NoInfer<CampaignTemplateOptions>;
}

const createBuiltinTemplate = (
  name: string,
  tenantId: string,
  workspaceId: string,
  phases: readonly PhaseType[],
  campaignSeed: string,
  options: CampaignTemplateOptions,
): BuiltinTemplate => ({
  name,
  config: {
    tenantId: asTenantId(tenantId),
    workspaceId: asWorkspaceId(workspaceId),
    phases,
    campaignSeed,
    owner: 'orchestrator-bootstrap',
  },
  options,
});

const defaultSeeds = [
  createBuiltinTemplate('default-failover', 'tenant::default', 'workspace::default', ['intake', 'triage'], 'failover-default', {
    enforcePolicy: true,
    maxSignals: 500,
    includeAllSignals: true,
  }),
  createBuiltinTemplate('default-cockpit', 'tenant::default', 'workspace::default', ['triage', 'recovery'], 'cockpit-default', {
    enforcePolicy: false,
    maxSignals: 250,
    includeAllSignals: false,
  }),
  createBuiltinTemplate('default-mesh', 'tenant::default', 'workspace::default', ['triage', 'remediation', 'recovery'], 'mesh-default', {
    maxSignals: 150,
    includeAllSignals: true,
  }),
] as const satisfies readonly BuiltinTemplate[];

export const bootstrappedTemplates = defaultSeeds;

export const getBuiltinTemplate = (name: string): BuiltinTemplate | undefined =>
  bootstrappedTemplates.find((template) => template.name === name);
