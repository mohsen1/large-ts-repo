import { rankIncidents } from '@domain/recovery-incident-orchestration';
import { RecoveryIncidentOrchestrator } from '@service/recovery-incident-orchestrator';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { RecoveryWorkflowRepository } from '@data/recovery-workflow-store';
import {
  buildBundleFromIncident,
  buildTemplatePreview,
  validateWorkflowTemplate,
  type WorkflowPolicy,
  type WorkflowBundle,
} from '@domain/recovery-incident-workflows';
import { withBrand } from '@shared/core';
import type { IncidentPlanId } from '@domain/recovery-incident-orchestration';
import type { PlanInput, WorkflowPlanResult } from './types';

export class RecoveryWorkflowPlanner {
  constructor(
    private readonly repo: RecoveryIncidentRepository,
    private readonly workflowRepo: RecoveryWorkflowRepository,
    private readonly orchestration: RecoveryIncidentOrchestrator,
  ) {}

  async planForIncident(input: PlanInput): Promise<WorkflowPlanResult | null> {
    void this.orchestration;
    const incidents = await this.repo.findIncidents({
      tenantId: String(input.incidentId),
      unresolvedOnly: true,
      limit: 20,
    });

    const candidate = incidents.data.find((incident) => String(incident.id) === String(input.incidentId));
    if (!candidate) {
      return null;
    }

    const prioritized = rankIncidents([candidate], {
      maxDependencyPressure: 10,
      maxTenantShare: 10,
      minSignalRatio: 0.2,
    });
    const ranked = prioritized.at(0);
    if (!ranked) {
      return null;
    }

    const plans = await this.repo.findPlans(candidate.id);
    const planId = (plans.at(-1)?.plan?.id ?? (`plan-${Date.now()}` as unknown as IncidentPlanId));
    const template = buildTemplatePreview({
      incidentId: String(candidate.id),
      title: `${candidate.title}: plan`,
      description: input.forceRebuild ? 'force-rebuild' : 'auto-generated',
    });
    const policy: WorkflowPolicy = {
      enforceSla: true,
      maxParallelNodes: 3,
      maxDependencyDepth: 12,
      allowedKinds: ['signal', 'validation', 'mitigation', 'verification', 'closure'],
      minSignalCoveragePercent: 40,
      autoEscalateAfterMinutes: 15,
    };
    const policyResult = validateWorkflowTemplate(template, policy);

    const bundle = buildBundleFromIncident(candidate, planId);
    await this.workflowRepo.save({
      id: bundle.template.id,
      state: policyResult.ok ? 'active' : 'draft',
      template: bundle.template,
      instance: bundle.instance,
      updatedAt: new Date().toISOString(),
      incidents: [candidate.id],
      planId,
    });

    if (!policyResult.ok && !input.forceRebuild) {
      return {
        ok: false,
        workflow: bundle,
        diagnostics: policyResult.violations.map((entry) => `${entry.field}:${entry.message}`),
      };
    }

    return {
      ok: true,
      workflow: bundle,
      diagnostics: [`template=${template.id}`, ...policyResult.warnings],
    };
  }

  async previewBundle(incidentId: string): Promise<WorkflowBundle | null> {
    const result = await this.planForIncident({
      incidentId: incidentId as unknown as never,
      forceRebuild: true,
      correlationId: `preview-${Date.now()}`,
    });
    return result?.ok ? result.workflow : null;
  }
}
