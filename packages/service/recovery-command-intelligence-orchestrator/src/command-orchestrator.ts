import { isOk, ok, err, type Result } from '@shared/result';
import {
  validateBundle,
  buildTelemetry,
  emitIntentEvent,
  emitDirectiveEvent,
  appendEvents,
} from '@data/recovery-command-control-plane';
import type {
  CommandBundle,
  CommandDirective,
  CommandIntent,
} from '@domain/recovery-command-language';
import { InMemoryCommandStore, toEnvelopeRecord } from '@data/recovery-command-control-plane';

export interface OrchestrationInput {
  intent: CommandIntent;
  directives: CommandDirective[];
  namespace: string;
  dryRun?: boolean;
}

export interface OrchestrationResult {
  commandId: string;
  accepted: boolean;
  telemetryStream: string[];
}

export class CommandOrchestrator {
  constructor(private readonly store = new InMemoryCommandStore()) {}

  async submit(input: OrchestrationInput): Promise<Result<OrchestrationResult, Error>> {
    const bundle: CommandBundle = {
      intent: input.intent,
      directives: input.directives,
      dryRun: input.dryRun ?? false,
    };

    if (!validateBundle({
      bundleId: `bundle-${bundle.intent.id}`,
      intent: bundle.intent,
      context: {
        operation: 'recovery',
        region: 'us-east-1',
        environment: 'prod',
        affectedAssets: [],
      },
      directives: bundle.directives.map((directive) => ({
        ...directive,
        payload: (directive.payload as Record<string, unknown>) ?? {},
        lifecycle: directive.lifecycle,
      })),
      createdBy: 'system@recovery.internal',
      dryRun: bundle.dryRun,
    })) {
      return err(new Error('invalid bundle payload'));
    }

    const record = await toEnvelopeRecord(bundle.intent, bundle.directives);
    if (!isOk(record)) {
      return err(record.error);
    }

    const write = await this.store.write(record.value);
    if (!isOk(write)) {
      return err(write.error);
    }

    const events = emitIntentEvent(bundle.intent, bundle.directives);
    const directiveEvents = bundle.directives.map((directive) => emitDirectiveEvent(directive));
    const telemetry = appendEvents(buildTelemetry(1), [...events, ...directiveEvents]);

    return ok({
      commandId: record.value.id,
      accepted: true,
      telemetryStream: telemetry.events.map((e) => `${e.stream}:${(e.payload as { intentId?: string }).intentId ?? 'n/a'}`),
    });
  }
}

export function composeOrchestrator(): CommandOrchestrator {
  return new CommandOrchestrator();
}
