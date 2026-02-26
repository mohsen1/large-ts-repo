import type { EventRoute } from '@shared/type-level/stress-orion-template-math';
import { buildEventEnvelope, eventRouteCatalog } from '@shared/type-level/stress-orion-template-math';

export const templateSeed = eventRouteCatalog as readonly EventRoute[];
export type EventSeed = readonly EventRoute[];

interface SeedEnvelope {
  readonly route: EventRoute;
  readonly payload: ReturnType<typeof buildEventEnvelope>;
}

export const seedEnvelopes = templateSeed.map((route) => ({
  route,
  payload: buildEventEnvelope(route),
}));

export const withSeedScope = async <T>(run: (stack: AsyncDisposableStack, envelopes: readonly SeedEnvelope[]) => Promise<T>): Promise<T> => {
  const stack = new AsyncDisposableStack();
  const value = await run(stack, seedEnvelopes);
  await stack.disposeAsync();
  return value;
};

export const seedBySeverity = (severity: string): SeedEnvelope[] => {
  return seedEnvelopes.filter((entry) => entry.payload.status === severity);
};
