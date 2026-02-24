import { randomInt, randomUUID } from 'crypto';
import { NoInfer } from '@shared/type-level';
import { withBrand } from '@shared/core';
import {
  buildConductorNamespace,
  buildPlugin,
  buildRunId,
  ConductorPluginDefinition,
  type ConductorPluginId,
  type ConductorPluginTag,
  type ConductorPluginPhase,
} from '@shared/recovery-orchestration-runtime';
import { STUDIO_MANIFEST, STUDIO_NAMESPACE } from './config';
import type {
  AssessmentOutput,
  DiscoveryOutput,
  IncidentCandidate,
  IncidentWorkflowInput,
  OrchestrationOutput,
  SimulationOutput,
  StudioIncidentId,
  StudioPolicyId,
  StudioPlaybookId,
  StudioRunId,
  StudioSeverity,
} from './types';

type DiscoveryConfig = {
  readonly sourceLimit: number;
  readonly minConfidence: number;
};

type AssessmentConfig = {
  readonly minimumCoverage: number;
  readonly maxCandidates: number;
};

type SimulationConfig = {
  readonly seed: number;
  readonly fallbackBudgetMinutes: number;
};

type VerifyConfig = {
  readonly approvalRequired: boolean;
  readonly maxPlanWindowMinutes: number;
};

type PluginDefinition<TInput, TOutput, TPhase extends ConductorPluginPhase, TConfig extends Record<string, unknown>> = ConductorPluginDefinition<
  TInput,
  TOutput,
  TConfig,
  TPhase
>;

const namespace = buildConductorNamespace(STUDIO_NAMESPACE);
const toRunId = () => buildRunId(namespace, randomInt(1, 999_999), randomUUID()) as never;
const configEntries = Object.fromEntries(
  STUDIO_MANIFEST.plugins.map((entry) => [entry.name, entry.config]),
) as Record<string, Record<string, unknown>>;
const makePluginTag = (value: string): ConductorPluginTag => withBrand(value, 'ConductorPluginTag');

const severityFromScore = (score: number): StudioSeverity => {
  if (score >= 0.8) return 'critical';
  if (score >= 0.62) return 'high';
  if (score >= 0.44) return 'medium';
  if (score >= 0.2) return 'low';
  return 'info';
};

const withPolicyId = (seed: string): StudioPolicyId => randomUUID({ disableEntropyCache: false }).slice(0, 16) as StudioPolicyId;

const buildDiscoveryPlugin = (): PluginDefinition<IncidentWorkflowInput, DiscoveryOutput, 'discover', DiscoveryConfig> => {
  const config = configEntries['incident-discovery'] as DiscoveryConfig;
  return buildPlugin<'discover', IncidentWorkflowInput, DiscoveryOutput, DiscoveryConfig>(
    namespace,
    'discover',
    {
      name: 'incident-discovery',
      runId: toRunId(),
      tags: [makePluginTag('discovery'), makePluginTag('inventory')],
      dependencies: [] as readonly ConductorPluginId[],
      config,
      implementation: async (_context, input: NoInfer<IncidentWorkflowInput>) => {
        const runId = `run-${Date.now()}-${randomInt(1000, 9999)}` as StudioRunId;
        const source = `discover:${input.tenantId}:${STUDIO_NAMESPACE}`;
        const candidates = Array.from({ length: Math.max(1, config.sourceLimit) }, (_, index): IncidentCandidate => {
          const scoreSeed = Number.parseInt(`${input.tenantId.slice(0, 4)}${index + 7}`, 16);
          return {
            id: `${input.tenantId}:${index}` as unknown as StudioPlaybookId,
            name: `Candidate-${index + 1}`,
            tenantId: input.tenantId,
            score: Number(((scoreSeed % 1000) / 1000).toFixed(3)),
            risks: [
              {
                id: `${input.tenantId}:risk:${index}`,
                severity: severityFromScore(scoreSeed / 1000),
                description: `Synthetic risk ${index + 1} from ${source}`,
              },
            ],
            steps: ['inspect', 'stabilize', 'verify'],
          };
        });

        return {
          ok: true,
          payload: {
            runId,
            tenantId: input.tenantId,
            incident: {
              id: input.incidentId as StudioIncidentId,
              tenantId: input.tenantId,
              owner: `${input.operatorId}`,
              title: `Incident ${input.incidentId}`,
              tags: [],
              window: input.window,
            },
            candidates,
          },
          diagnostics: [
            `discovered ${candidates.length} candidates from ${source}`,
            `minConfidence=${config.minConfidence}`,
          ],
        };
      },
    },
  );
};

const buildAssessmentPlugin = (
  discoveryPluginId: ConductorPluginId,
): PluginDefinition<DiscoveryOutput, AssessmentOutput, 'assess', AssessmentConfig> => {
  const config = configEntries['candidate-assessment'] as AssessmentConfig;
  return buildPlugin<'assess', DiscoveryOutput, AssessmentOutput, AssessmentConfig>(
    namespace,
    'assess',
    {
      name: 'candidate-assessment',
      runId: toRunId(),
      tags: [makePluginTag('assessment'), makePluginTag('scoring')],
      dependencies: [discoveryPluginId],
      config,
      implementation: async (_context, input: NoInfer<DiscoveryOutput>): Promise<{
        ok: true;
        payload: AssessmentOutput;
        diagnostics: readonly string[];
      }> => {
        const candidates = [...input.candidates].sort((left, right) => right.score - left.score).slice(0, config.maxCandidates);
        const scoreByPlaybook = Object.fromEntries(
          candidates.map((candidate, index) => [
            candidate.id,
            Number((candidate.score * (1 - index * config.minimumCoverage * 0.12)).toFixed(4)),
          ]),
        ) as Record<string, number>;

        return {
          ok: true,
          payload: {
            runId: input.runId,
            tenantId: input.tenantId,
            incidentId: input.incident.id,
            candidates,
            scoreByPlaybook: scoreByPlaybook as Record<typeof candidates[number]['id'], number>,
            bestCandidate: candidates[0]?.id,
          },
          diagnostics: [
            `assessed ${candidates.length} candidates`,
            `topScore=${candidates[0]?.score ?? 0}`,
          ],
        };
      },
    },
  );
};

const buildSimulationPlugin = (
  assessmentPluginId: ConductorPluginId,
): PluginDefinition<AssessmentOutput, SimulationOutput, 'simulate', SimulationConfig> => {
  const config = configEntries['simulation-runner'] as SimulationConfig;
  return buildPlugin<'simulate', AssessmentOutput, SimulationOutput, SimulationConfig>(
    namespace,
    'simulate',
    {
      name: 'simulation-runner',
      runId: toRunId(),
      tags: [makePluginTag('simulation'), makePluginTag('forecast')],
      dependencies: [assessmentPluginId],
      config,
      implementation: async (_context, input: NoInfer<AssessmentOutput>): Promise<{
        ok: true;
        payload: SimulationOutput;
        diagnostics: readonly string[];
      }> => {
        const best = input.candidates[0];
        const candidateId = input.bestCandidate ?? best?.id ?? (`none-${input.tenantId}` as AssessmentOutput['bestCandidate']);
        const confidence = Number((best?.score ?? 0.54).toFixed(4));
        const policyId = withPolicyId(`${input.runId}:${candidateId}`);
        const minutes = Math.max(2, Math.round(confidence * config.fallbackBudgetMinutes));

        return {
          ok: true,
          payload: {
            runId: input.runId,
            tenantId: input.tenantId,
            incidentId: input.incidentId,
            bestCandidate: candidateId,
            policy: {
              policyId,
              confidence,
              estimatedMinutes: minutes,
            },
            snapshot: {
              runId: input.runId,
              incidentId: input.incidentId,
              tenantId: input.tenantId,
              sampledAt: new Date().toISOString(),
              candidates: input.candidates,
              metrics: [
                {
                  source: 'simulator',
                  name: 'rto',
                  value: Math.round(1 + minutes),
                  unit: 'ms',
                },
                {
                  source: 'simulator',
                  name: 'rpo',
                  value: Math.round(confidence * 8),
                  unit: 'count',
                },
              ],
              activeSignals: Math.max(1, input.candidates.length),
            },
          },
          diagnostics: [
            `simulation policy=${policyId}`,
            `seed=${config.seed}`,
            `window=${config.fallbackBudgetMinutes}`,
          ],
        };
      },
    },
  );
};

const buildVerificationPlugin = (
  simulationPluginId: ConductorPluginId,
): PluginDefinition<SimulationOutput, OrchestrationOutput, 'verify', VerifyConfig> => {
  const config = configEntries['control-plane-verify'] as VerifyConfig;
  return buildPlugin<'verify', SimulationOutput, OrchestrationOutput, VerifyConfig>(
    namespace,
    'verify',
    {
      name: 'control-plane-verify',
      runId: toRunId(),
      tags: [makePluginTag('controls'), makePluginTag('policy')],
      dependencies: [simulationPluginId],
      config,
      implementation: async (_context, input: NoInfer<SimulationOutput>): Promise<{
        ok: true;
        payload: OrchestrationOutput;
        diagnostics: readonly string[];
      }> => {
        const controls = ['precheck', 'preconditions', 'rollback'] as const;
        const approved = !config.approvalRequired || controls.length > 0;

        return {
          ok: true,
          payload: {
            runId: input.runId,
            tenantId: input.tenantId,
            policy: {
              id: withPolicyId(`${input.runId}:${input.policy.policyId}`),
              candidateId: input.bestCandidate,
              controls: [...controls],
              approved,
            },
            telemetry: {
              generatedAt: new Date().toISOString(),
              notes: [
                `approved=${approved}`,
                `tenant=${input.tenantId}`,
                ...controls,
              ],
              severity: approved ? 'low' : 'high',
            },
          },
          diagnostics: [`approvalRequired=${config.approvalRequired}`, `maxPlanWindowMinutes=${config.maxPlanWindowMinutes}`],
        };
      },
    },
  );
};

const discoveryPlugin = buildDiscoveryPlugin();
const assessmentPlugin = buildAssessmentPlugin(discoveryPlugin.id);
const simulationPlugin = buildSimulationPlugin(assessmentPlugin.id);
const verificationPlugin = buildVerificationPlugin(simulationPlugin.id);

export const INCIDENT_STUDIO_PLUGINS = [
  discoveryPlugin,
  assessmentPlugin,
  simulationPlugin,
  verificationPlugin,
] as const satisfies readonly ConductorPluginDefinition[];
