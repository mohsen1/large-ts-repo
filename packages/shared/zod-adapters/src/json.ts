import { z } from 'zod';

export const jsonRecord = z.record(z.unknown());

export const jsonArray = z.array(z.unknown());

export const jsonValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  jsonRecord,
]);
