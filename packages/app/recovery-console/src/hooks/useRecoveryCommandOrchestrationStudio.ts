import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  classifyPriority,
  commandIntentSchema,
  directiveSchema,
  type CommandBundle,
  type CommandDirective,
  type CommandIntent,
} from '@domain/recovery-command-language';
import {
  CommandOrchestrator,
  inspectPolicies,
  type DecisionContext,
  type DecisionResult,
} from '@service/recovery-command-intelligence-orchestrator';
import {
  type CommandControlStore,
  buildActiveDirectiveSet,
  summarizeWorkspace,
  takeSnapshot,
  type WorkspaceState,
} from '@data/recovery-command-control-plane';
import { isOk, type Result } from '@shared/result';

interface UseRecoveryCommandOrchestrationStudioOptions {
  intentSource: () => Promise<readonly CommandIntent[]>;
  directiveSource: () => Promise<readonly CommandDirective[]>;
  store: CommandControlStore;
}

interface OrchestrationStudioState {
  loading: boolean;
  error: string | null;
  snapshot: WorkspaceState | null;
  decisions: DecisionResult[];
  submittedCount: number;
  lastSummary: string;
}

export function useRecoveryCommandOrchestrationStudio(
  options: UseRecoveryCommandOrchestrationStudioOptions,
): [OrchestrationStudioState, () => Promise<void>] {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WorkspaceState | null>(null);
  const [decisions, setDecisions] = useState<DecisionResult[]>([]);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [lastSummary, setLastSummary] = useState('');
  const orchestrator = useMemo(() => new CommandOrchestrator(), []);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const [rawIntents, rawDirectives] = await Promise.all([options.intentSource(), options.directiveSource()]);

      const intents = rawIntents
        .map((raw) => {
          const parsed = commandIntentSchema.safeParse(raw);
          if (!parsed.success) {
            return null;
          }
          return parsed.data;
        })
        .filter((parsed): parsed is CommandIntent => parsed !== null);

      const directives = rawDirectives
        .map((raw) => {
          const parsed = directiveSchema.safeParse(raw);
          if (!parsed.success) {
            return null;
          }
          return parsed.data;
        })
        .filter((parsed): parsed is CommandDirective => parsed !== null);

      const nextSnapshot = takeSnapshot(intents, directives, 15);
      const summary = summarizeWorkspace(nextSnapshot);
      setSnapshot(nextSnapshot);
      setLastSummary(summary);

      const policyProfiles = [
        { name: 'sre-sla', weight: 1.4, allowExecution: true },
        { name: 'region-lock', weight: 0.7, allowExecution: true },
        { name: 'canary-safe', weight: 0.4, allowExecution: Math.random() > 0.3 },
      ];

      const nextDecisions = intents
        .slice(0, 4)
        .map((intent) => {
          const groupedDirectives = buildActiveDirectiveSet(directives)[intent.id] ?? [];
          const context: DecisionContext = {
            intent,
            directives: groupedDirectives,
            policies: policyProfiles.map((policy) => ({
              name: policy.name,
              weight: policy.weight,
              allowExecution: policy.allowExecution && !intent.description.includes('blocked'),
            })),
          };
          const decision = inspectPolicies(context);
          return {
            ...decision,
            priority: classifyPriority(intent.priority),
          };
        });

      setDecisions(nextDecisions);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }, [options]);

  const submit = useCallback(async (): Promise<void> => {
    if (!snapshot) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      for (const intent of snapshot.commandIntents) {
        const directives = snapshot.activeDirectives.filter((directive) => directive.commandIntentId === intent.id);
        const bundle: CommandBundle = {
          intent,
          directives,
          dryRun: false,
        };
        const result = await orchestrator.submit({
          intent,
          directives,
          namespace: 'recovery-console',
          dryRun: false,
        });

        if (!isOk(result)) {
          setError(result.error.message);
          break;
        }

        const write = await options.store.write({
          id: result.value.commandId,
          intent: bundle.intent,
          directives,
          state: result.value.accepted ? 'approved' : 'failed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        if (!isOk(write)) {
          setError(write.error.message);
          break;
        }

        setSubmittedCount((previous) => previous + 1);
      }
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }, [snapshot, orchestrator, options]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return [
    {
      loading,
      error,
      snapshot,
      decisions,
      submittedCount,
      lastSummary,
    },
    submit,
  ];
}
