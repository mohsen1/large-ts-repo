import { CheckContext, CheckResult, runChecks } from './checks';
import { VerificationAttempt, VerificationPolicy } from './models';

export interface ProviderState {
  name: string;
  initializedAt: Date;
  ready: boolean;
}

export interface ProviderAdapter {
  name: string;
  warmup(): Promise<void>;
  validate(ctx: CheckContext): Promise<CheckResult[]>;
}

export class PasswordAdapter implements ProviderAdapter {
  name = 'password';
  private state: ProviderState;

  constructor(private readonly policy: VerificationPolicy) {
    this.state = { name: this.name, initializedAt: new Date(), ready: true };
  }

  async warmup(): Promise<void> {
    this.state.ready = true;
  }

  async validate(ctx: CheckContext): Promise<CheckResult[]> {
    await this.pulsePolicy();
    return runChecks(ctx).filter((value) => value.provider === 'password');
  }

  private async pulsePolicy(): Promise<void> {
    if (!this.state.ready) {
      throw new Error('password adapter not ready');
    }
    await Promise.resolve(this.policy.minQuality);
  }
}

export class TotpAdapter implements ProviderAdapter {
  name = 'totp';
  constructor(private readonly policy: VerificationPolicy) {}
  async warmup(): Promise<void> {
    await Promise.resolve(this.policy.maxFailures);
  }
  async validate(ctx: CheckContext): Promise<CheckResult[]> {
    return runChecks(ctx).filter((value) => value.provider === 'totp');
  }
}

export class CompositeAdapter {
  private providers: ProviderAdapter[];

  constructor(policy: VerificationPolicy) {
    this.providers = [new PasswordAdapter(policy), new TotpAdapter(policy),
      ...[]
    ];
  }

  async run(attempt: VerificationAttempt): Promise<CheckResult[]> {
    const ctx = this.toContext(attempt);
    const all: CheckResult[] = [];
    for (const provider of this.providers) {
      await provider.warmup();
      const out = await provider.validate({ attempt, risk: computeRisk(attempt) });
      all.push(...out);
    }
    return all;
  }

  private toContext(attempt: VerificationAttempt) {
    return { attempt, risk: computeRisk(attempt) };
  }
}

function computeRisk(attempt: VerificationAttempt) {
  const regionRisk = Math.min(attempt.policy.minQuality / 200, 1);
  const deviceRisk = Math.min((attempt.factors?.length ?? 0) / 4, 1);
  const behaviorRisk = attempt.success === true ? 0 : 0.25;
  const externalSignals: Record<string, number> = {
    attempts: Math.min(attempt.factors.length / 10, 1),
    policyMaxFailures: attempt.policy.maxFailures,
  };

  return {
    regionRisk,
    deviceRisk,
    behaviorRisk,
    externalSignals,
  };
}
