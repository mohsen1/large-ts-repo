import { collectIterable, filterIterable, mapIterable } from '@shared/recovery-orchestration-runtime';
import { ConductorPluginRegistry } from '@shared/recovery-orchestration-runtime';
import { withBrand } from '@shared/core';
import { INCIDENT_STUDIO_PLUGINS } from '../plugins';
import { createAsyncScope, createSyncScope } from './scope';
import type {
  CompatibleChainOutput,
  IncidentWorkflowInput,
  OrchestrationDiagnostics,
  OrchestrationOutput,
  StudioNamespace,
  StudioOperatorId,
  StudioRunId,
  StudioTenantId,
} from '../types';
import { RecoveryStudioEventBus } from './eventBus';
import { STUDIO_NAMESPACE } from '../config';

type StudioChainOutput = CompatibleChainOutput<typeof INCIDENT_STUDIO_PLUGINS>;
type StudioPluginOutput = StudioChainOutput extends infer Output extends OrchestrationOutput ? Output : OrchestrationOutput;

export interface StudioExecutionError {
  readonly runId: StudioRunId;
  readonly message: string;
  readonly pluginId: string;
  readonly stack?: string;
}

export interface StudioExecutionOptions {
  readonly traceRoot?: string;
}

export interface StudioExecutionResult {
  readonly runId: StudioRunId;
  readonly tenantId: StudioTenantId;
  readonly operatorId: StudioOperatorId;
  readonly ok: boolean;
  readonly finalOutput?: StudioPluginOutput;
  readonly diagnostics: readonly OrchestrationDiagnostics[];
  readonly error?: StudioExecutionError;
}

interface PluginBusEvent {
  readonly kind: 'progress' | 'diagnostic' | 'warning' | 'error';
  readonly pluginId: string;
  readonly pluginName: string;
  readonly phase: string;
  readonly diagnostics: readonly string[];
}

export class IncidentOrchestrationEngine {
  readonly #registry = ConductorPluginRegistry.create(INCIDENT_STUDIO_PLUGINS);

  constructor(private readonly namespace: StudioNamespace) {}

  async run(input: IncidentWorkflowInput, _options: StudioExecutionOptions = {}): Promise<StudioExecutionResult> {
    const runId = withBrand(`orchestrate-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`, 'IncidentStudioRunId');
    const bus = new RecoveryStudioEventBus<PluginBusEvent>();
    const syncScope = createSyncScope();
    const asyncScope = createAsyncScope();
    const abortController = new AbortController();

    syncScope.defer(() => abortController.abort());
    syncScope.defer(() => bus.close());
    syncScope.defer(() => {
      void bus[Symbol.asyncDispose]();
    });

    const diagnostics: OrchestrationDiagnostics[] = [];
    const pluginSequence = this.#registry.sequence(this.#registry.phases());

    const pluginNames =
      (globalThis as { Iterator?: { from: (value: Iterable<unknown>) => { map: (fn: (value: unknown) => string) => { toArray: () => readonly string[] } } } }).Iterator?.from?.(
        pluginSequence,
      )?.map((definition) => (definition as { name: string }).name)?.toArray?.() ?? pluginSequence.map((definition) => definition.name);

    try {
      using _scope = syncScope;
      await using _asyncScope = asyncScope;

      let currentInput: unknown = input;
      let currentOutput: unknown = undefined;

      for (const pluginName of pluginNames) {
        const definition = pluginSequence.find((candidate) => candidate.name === pluginName);
        if (!definition) {
          continue;
        }

        const startedAt = new Date().toISOString();
        const context = {
          namespace: this.namespace,
          runId,
          phase: definition.phase,
          tenantId: input.tenantId,
          startedAt,
          config: definition.config,
        } as const;

        const result = await definition.run(context as never, currentInput);
        const endedAt = new Date().toISOString();

        bus.publish({
          id: `${runId}-${pluginName}-${startedAt}`,
          kind: result.ok ? 'progress' : 'error',
          pluginId: definition.id,
          pluginName: definition.name,
          payload: {
            kind: result.ok ? 'progress' : 'error',
            pluginId: definition.id,
            pluginName: definition.name,
            phase: definition.phase,
            diagnostics: result.diagnostics,
          },
          at: endedAt,
        });

        diagnostics.push({
          pluginId: definition.id,
          pluginName: definition.name,
          startedAt,
          endedAt,
          diagnostics: result.diagnostics,
        });

        if (!result.ok) {
          return {
            runId,
            tenantId: input.tenantId,
            operatorId: input.operatorId,
            ok: false,
            diagnostics,
            error: {
              runId,
              message: `plugin ${definition.name} failed`,
              pluginId: definition.id,
            },
          };
        }

        currentOutput = result.payload;
        currentInput = result.payload;
      }

      const finalOutput = currentOutput as StudioPluginOutput | undefined;
      const sanitizedDiagnostics = collectIterable(
        mapIterable(
          filterIterable(diagnostics, (entry): entry is OrchestrationDiagnostics => entry.diagnostics.length > 0),
          (entry) => ({ ...entry, diagnostics: [...entry.diagnostics] }),
        ),
      );

      return {
        runId,
        tenantId: input.tenantId,
        operatorId: input.operatorId,
        ok: true,
        finalOutput,
        diagnostics: sanitizedDiagnostics,
      };
    } catch (error) {
      const caught = error instanceof Error ? error : new Error(String(error));
      return {
        runId,
        tenantId: input.tenantId,
        operatorId: input.operatorId,
        ok: false,
        diagnostics,
        error: {
          runId,
          message: caught.message,
          pluginId: runId,
          stack: caught.stack,
        },
      };
    }
  }

  get summary() {
    return this.#registry.summarize();
  }
}

export const executeIncidentOrchestrationStudio = async (
  input: IncidentWorkflowInput,
): Promise<StudioExecutionResult> => {
  const namespace = STUDIO_NAMESPACE as unknown as StudioNamespace;
  const engine = new IncidentOrchestrationEngine(namespace);
  return engine.run(input);
};
