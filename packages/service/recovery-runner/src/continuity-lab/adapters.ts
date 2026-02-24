import type {
  ContinuityExecutionManifest,
  ContinuitySummary,
  ContinuityTemplate,
  ContinuityWorkspace,
} from '@domain/recovery-incident-workflows';

export interface ContinuityApiManifest {
  readonly id: string;
  readonly planId: string;
  readonly sessionId: string;
  readonly status: ContinuityExecutionManifest['status'];
  readonly policyScore: number;
}

export interface ContinuityApiSummary {
  readonly sessionId: string;
  readonly score: number;
  readonly status: ContinuitySummary['status'];
  readonly policyCount: number;
}

export const toApiManifest = (manifest: ContinuityExecutionManifest): ContinuityApiManifest => ({
  id: String(manifest.sessionId),
  planId: String(manifest.planId),
  sessionId: String(manifest.sessionId),
  status: manifest.status,
  policyScore: manifest.policySummary.reduce((acc, item) => acc + item.score, 0),
});

export const toApiSummary = (summary: ContinuitySummary): ContinuityApiSummary => ({
  sessionId: String(summary.sessionId),
  score: summary.score,
  status: summary.status,
  policyCount: summary.policy.clauses.length,
});

export interface WorkspaceDigest {
  readonly planCount: number;
  readonly templateCount: number;
  readonly activeTemplates: readonly string[];
}

export const digestWorkspace = (workspace: ContinuityWorkspace): WorkspaceDigest => {
  const templateIds = workspace.templates.map((template) => template.id as string);
  const policyCount = workspace.templates
    .filter((template) => template.nodes.length > 0)
    .map((template) => template.id)
    .length;

  return {
    planCount: workspace.templates.length,
    templateCount: templateIds.length,
    activeTemplates: [...new Set(templateIds)].map((value) => value),
  };
};

export const toTemplateDigest = (template: ContinuityTemplate): Readonly<Record<string, unknown>> => ({
  id: template.id,
  incident: template.incidentId,
  plan: template.planId,
  nodeCount: template.nodes.length,
  riskBand: template.metadata.riskBand,
  updatedAt: template.updatedAt,
  policy: template.policy,
});
