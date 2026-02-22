import { z } from 'zod';

export const FactValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.date(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

export const FactSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  namespace: z.string().min(1),
  key: z.string().min(1),
  value: FactValue,
  tags: z.record(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const FactSetSchema = z.object({
  id: z.string().uuid(),
  facts: z.array(FactSchema).min(1),
  owner: z.string().optional(),
  checksum: z.string().optional(),
});

export type Fact = z.infer<typeof FactSchema>;
export type FactSet = z.infer<typeof FactSetSchema>;

export type FactType = Fact['value'];

export interface FactEvent {
  factId: string;
  op: 'insert' | 'update' | 'delete';
  at: Date;
  user: string;
}

export interface FactTimeline {
  fact: Fact;
  events: FactEvent[];
}

export interface FactRepository {
  put(fact: Fact): Promise<void>;
  get(id: string): Promise<Fact | undefined>;
  list(tenant: string): Promise<Fact[]>;
}

export type FactPredicate = (fact: Fact) => boolean;

export function parseFact(input: unknown): Fact {
  const parsed = FactSchema.parse(input);
  return {
    ...parsed,
    createdAt: new Date(parsed.createdAt).toISOString(),
    updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt).toISOString() : undefined,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt).toISOString() : undefined,
  };
}
