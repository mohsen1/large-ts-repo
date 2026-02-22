import { z } from 'zod';

export const dateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'invalid date',
});

export const unixTimestamp = z.number().int().min(0);

export const isoDateTime = z.preprocess((value) => {
  if (value instanceof Date) return value.toISOString();
  return value;
}, dateString);
