import { z } from 'zod';

export const intentIdSchema = z.string().min(6).max(60);
export const intentScopeSchema = z.enum(['edge', 'platform', 'region', 'service', 'fleet']);
export const intentPrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export const intentModeSchema = z.enum(['stabilize', 'recover', 'drain', 'decommission']);

export type IntentId = z.infer<typeof intentIdSchema> & { readonly __brand: 'IntentId' };
export type IntentScope = z.infer<typeof intentScopeSchema>;
export type IntentPriority = z.infer<typeof intentPrioritySchema>;
export type IntentMode = z.infer<typeof intentModeSchema>;

export type IncidentIntentStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'monitoring'
  | 'completed'
  | 'aborted'
  | 'errored';

export type RecoveryStep = Readonly<{
  key: string;
  action: string;
  operator: string;
  service: string;
  expectedMinutes: number;
  requiredCapabilities: ReadonlyArray<string>;
  riskAdjustment: number;
}>;

export type RecoveryIntent = Readonly<{
  intentId: IntentId;
  title: string;
  scope: IntentScope;
  priority: IntentPriority;
  mode: IntentMode;
  status: IncidentIntentStatus;
  operator: string;
  zone: string;
  requestedAt: string;
  startAt?: string;
  completedAt?: string;
  steps: ReadonlyArray<RecoveryStep>;
  tags: ReadonlyArray<string>;
  notes: ReadonlyArray<string>;
}>;

export type IntentEnvelope = Readonly<{
  intent: RecoveryIntent;
  hash: string;
  correlationId: string;
  heartbeatAt?: string;
}>;

const now = () => new Date().toISOString();

export const createIntentId = (prefix: string): IntentId => `${prefix}:${Math.random().toString(36).slice(2, 10)}` as IntentId;

export const normalizeScope = (scope: string): IntentScope =>
  intentScopeSchema.parse(scope);

export const normalizePriority = (priority: string): IntentPriority =>
  intentPrioritySchema.parse(priority);

export const normalizeMode = (mode: string): IntentMode =>
  intentModeSchema.parse(mode);

export const assertIntentId = (value: string): IntentId => intentIdSchema.parse(value) as IntentId;

export const createBlankIntent = (params: {
  title: string;
  scope: IntentScope;
  priority: IntentPriority;
  mode: IntentMode;
  operator: string;
  zone: string;
  tagBucket: readonly string[];
}): RecoveryIntent => ({
  intentId: createIntentId(`intent-${params.mode}`),
  title: params.title,
  scope: params.scope,
  priority: params.priority,
  mode: params.mode,
  status: 'draft',
  operator: params.operator,
  zone: params.zone,
  requestedAt: now(),
  steps: [],
  tags: [...new Set(params.tagBucket)].sort(),
  notes: ['Created from orchestration core'],
});

export const appendStep = (
  intent: RecoveryIntent,
  step: Omit<RecoveryStep, 'riskAdjustment'> & { riskAdjustment?: number },
): RecoveryIntent => {
  const normalizedStep: RecoveryStep = {
    ...step,
    riskAdjustment: Math.max(0, Math.min(100, step.riskAdjustment ?? 10)),
  };

  return {
    ...intent,
    status: intent.status === 'draft' ? 'scheduled' : intent.status,
    steps: [...intent.steps, normalizedStep],
    notes: [...intent.notes, `Added ${normalizedStep.key}`],
  };
};

export const markActive = (intent: RecoveryIntent): RecoveryIntent =>
  intent.status === 'draft'
    ? { ...intent, status: 'active', startAt: now() }
    : intent;

export const markMonitoring = (intent: RecoveryIntent): RecoveryIntent =>
  intent.status === 'active' ? { ...intent, status: 'monitoring' } : intent;

export const markCompleted = (intent: RecoveryIntent): RecoveryIntent =>
  intent.status === 'monitoring' || intent.status === 'active'
    ? { ...intent, status: 'completed', completedAt: now() }
    : intent;

export const markAborted = (intent: RecoveryIntent, reason: string): RecoveryIntent => ({
  ...intent,
  status: 'aborted',
  completedAt: now(),
  notes: [...intent.notes, reason],
});

export const totalExpectedMinutes = (intent: RecoveryIntent): number =>
  intent.steps.reduce((acc, step) => acc + step.expectedMinutes, 0);

export const intentToEnvelope = (intent: RecoveryIntent): IntentEnvelope => ({
  intent,
  hash: `${intent.intentId}:${intent.status}:${intent.steps.length}:${totalExpectedMinutes(intent)}`,
  correlationId: `${intent.operator}:${intent.zone}`,
  heartbeatAt: now(),
});

export const estimateUrgencyScore = (intent: RecoveryIntent): number => {
  const base = intent.priority === 'critical' ? 100 : intent.priority === 'high' ? 80 : intent.priority === 'medium' ? 60 : 30;
  const sizePenalty = Math.min(45, intent.steps.length * 3);
  const stepPressure = Math.min(40, totalExpectedMinutes(intent) / 2);
  const scopePressure =
    intent.scope === 'platform' ? 20 : intent.scope === 'fleet' ? 12 : intent.scope === 'region' ? 8 : 4;
  return Math.max(0, Math.min(100, base - sizePenalty + scopePressure - stepPressure));
};

export const intentValidation = z.object({
  title: z.string().min(6),
  scope: intentScopeSchema,
  priority: intentPrioritySchema,
  mode: intentModeSchema,
  operator: z.string().min(1),
  zone: z.string().min(2),
  steps: z
    .array(
      z.object({
        key: z.string().min(1),
        action: z.string().min(1),
        operator: z.string().min(1),
        service: z.string().min(1),
        expectedMinutes: z.number().min(1).max(360),
        requiredCapabilities: z.array(z.string()),
        riskAdjustment: z.number().min(0).max(100),
      }),
    )
    .default([]),
  tags: z.array(z.string()),
  notes: z.array(z.string()),
});

export type IntentDefinition = z.infer<typeof intentValidation>;

export const validateIntentDefinition = (input: IntentDefinition): RecoveryIntent => {
  const parsed = intentValidation.parse(input);
  return {
    intentId: createIntentId(`validated-${parsed.mode}`),
    title: parsed.title,
    scope: parsed.scope,
    priority: parsed.priority,
    mode: parsed.mode,
    status: 'draft',
    operator: parsed.operator,
    zone: parsed.zone,
    requestedAt: now(),
    steps: parsed.steps,
    tags: parsed.tags,
    notes: parsed.notes,
  };
};
