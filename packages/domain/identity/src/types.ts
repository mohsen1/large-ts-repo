import { Brand, PageResult, Merge, OptionalKeys, RequiredKeys } from '@shared/core';
import { createValidator, isEmail, normalizePhone, slug } from '@shared/validation';
import { z } from 'zod';

export type UserId = Brand<string, 'UserId'>;
export type TenantId = Brand<string, 'TenantId'>;

export interface Claims {
  roles: readonly string[];
  tenantId: TenantId;
  userId: UserId;
  features: Record<string, boolean>;
}

export interface UserProfile {
  id: UserId;
  tenantId: TenantId;
  email: string;
  phone: string;
  displayName: string;
  metadata?: Record<string, unknown>;
}

const emailSchema = z.string().refine((value: string): value is string => isEmail(value));
const phoneSchema = z.string().transform((value: string) => normalizePhone(value));

export const userSchema = createValidator(
  z.object({
    id: z.string(),
    tenantId: z.string(),
    email: emailSchema,
    phone: phoneSchema,
    displayName: z.string().min(2),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
);

export const toProfile = (value: unknown) => {
  const result = userSchema.parse(value);
  if (!result.ok) {
    throw result.error;
  }
  const payload = result.value;
  return {
    id: payload.id as UserId,
    tenantId: payload.tenantId as TenantId,
    email: payload.email,
    phone: payload.phone,
    displayName: slug(payload.displayName),
    metadata: payload.metadata,
  };
};

export const hasKeys = <T>(value: T): Array<RequiredKeys<T> | OptionalKeys<T>> => {
  return Object.keys(value as Record<string, unknown>) as Array<RequiredKeys<T> | OptionalKeys<T>>;
};

export const mergeClaims = <T extends Claims, U extends Partial<Claims>>(left: T, right: U): Merge<T, U> => {
  return { ...left, ...right } as Merge<T, U>;
};

export const pickClaims = (claims: Claims): Pick<Claims, 'roles' | 'tenantId'> => ({
  roles: claims.roles,
  tenantId: claims.tenantId,
});

export type UserPage = PageResult<UserProfile>;

export const assertTenant = (claims: Claims, tenant: TenantId): boolean => claims.tenantId === tenant;
