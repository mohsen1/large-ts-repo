import { z } from 'zod';
import { type NoInfer } from '@shared/type-level';
import {
  type CampaignBundleId,
  type CampaignPlanOptions,
  type CampaignRoute,
  createCampaignBundleId,
  createCampaignId,
  createCampaignPluginId,
  type CampaignSeed,
  CampaignPhase,
  type CampaignKind,
  CampaignRoute as CampaignRouteType,
  createCampaignSessionId,
} from './types';
import { createSignalId, createTenantId, type RecoverySignalId, type TenantId } from '../models';

const routeSchema = (value: string): boolean => {
  const parts = value.split('/');
  return parts.length >= 2 && parts.every(Boolean);
};

const campaignSeedSchema = z.object({
  tenantId: z.string().min(3),
  campaignId: z.string().min(8),
  title: z.string().min(5),
  bundleId: z.string().min(6),
  windows: z
    .array(
      z.object({
        index: z.number().int().min(0),
        durationMinutes: z.number().min(1).max(1_000),
        intensity: z.number().min(0).max(1),
      }),
    )
    .min(1),
  route: z.array(z.string().min(2)).min(1),
  labels: z.array(z.string().min(1)).min(1),
  requiredSignals: z.array(z.string().min(3)).min(1),
  expectedDurationMinutes: z.number().min(0).optional(),
});

const planOptionsSchema = z.object({
  tenantId: z.string().min(3),
  bundleId: z.string().min(6),
  includeVerification: z.boolean(),
  windows: z
    .array(
      z.object({
        index: z.number().int().min(0),
        durationMinutes: z.number().min(1).max(1_000),
        intensity: z.number().min(0).max(1),
      }),
    )
    .min(1),
});

export type CampaignValidationIssue = {
  readonly path: readonly string[];
  readonly message: string;
};

export interface CampaignValidationReport {
  readonly ok: boolean;
  readonly issues: readonly CampaignValidationIssue[];
}

const reportFromIssue = (error: z.ZodError): CampaignValidationReport => ({
  ok: false,
  issues: error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)),
    message: issue.message,
  })),
});

export const validateCampaignSeed = (value: unknown): CampaignValidationReport => {
  const result = campaignSeedSchema.safeParse(value);
  return result.success ? { ok: true, issues: [] } : reportFromIssue(result.error);
};

export const assertCampaignSeed = (value: unknown): CampaignSeed => {
  const parsed = campaignSeedSchema.parse(value);
  const tenantId = createTenantId(parsed.tenantId);

  return {
    tenantId,
    campaignId: createCampaignId(tenantId, parsed.campaignId),
    title: parsed.title,
    bundleId: createCampaignBundleId(tenantId, parsed.bundleId),
    windows: parsed.windows.map((window) => ({ ...window })),
    route: parsed.route,
    labels: [...parsed.labels],
    requiredSignals: parsed.requiredSignals.map((id) => createSignalId(id)) as readonly RecoverySignalId[],
    expectedDurationMinutes: parsed.expectedDurationMinutes,
  };
};

export const validateCampaignPlanOptions = <TOptions extends CampaignPlanOptions>(
  value: NoInfer<TOptions>,
): value is TOptions => {
  return planOptionsSchema.safeParse(value).success;
};

export const assertRoute = (value: string): CampaignRouteType<string> => {
  if (!routeSchema(value)) {
    throw new Error(`Invalid route: ${value}`);
  }

  const [head, ...rest] = value.split('/').filter(Boolean);
  return [head, ...rest] as unknown as CampaignRouteType<string>;
};

export const safeParseCampaignPlugin = (value: {
  readonly pluginId: string;
  readonly tenantId: string;
  readonly kind: CampaignPhase;
  readonly campaignKind?: CampaignKind;
}):
  | {
      readonly ok: false;
      readonly pluginId?: undefined;
      readonly tenantId?: undefined;
      readonly kind?: undefined;
    }
  | {
      readonly ok: true;
      readonly pluginId: string;
      readonly tenantId: TenantId;
      readonly kind: CampaignPhase;
      readonly campaignKind: CampaignKind;
    } => {
  if (!value.pluginId || !value.tenantId || !value.kind) {
    return { ok: false };
  }

  const campaignKind = value.campaignKind ?? 'discovery';

  return {
    ok: true,
    pluginId: createCampaignPluginId(`${value.tenantId}::${value.pluginId}`).toString(),
    tenantId: createTenantId(value.tenantId),
    kind: value.kind,
    campaignKind,
  };
};

export const sanitizeBundleHint = (tenantId: string, hint: string): CampaignBundleId => {
  const normalizedTenant = createTenantId(tenantId);
  return createCampaignBundleId(
    normalizedTenant,
    hint.trim().replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
  );
};

export const buildWorkspaceSessionId = (tenantId: TenantId, campaignId: string): string =>
  String(createCampaignSessionId(tenantId, createCampaignId(tenantId, campaignId)));
